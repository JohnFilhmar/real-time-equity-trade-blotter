using System.Data.Common;
using System.Text.Json;
using Blotter.Contracts.Json;
using Blotter.Contracts.Wire;
using Blotter.Gateway.Auth;
using Blotter.Gateway.Data;
using Blotter.Gateway.Http;
using Blotter.Gateway.Settings;
using Blotter.Gateway.Tests.Fixtures;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;
using Bcrypt = BCrypt.Net.BCrypt;

namespace Blotter.Gateway.Tests;

/// <summary>
/// Sign-in and the session lifecycle, ported from the Node API's <c>auth_service.test.ts</c>. The
/// service runs over the real identity database and Redis rather than in-memory stores, and every
/// test signs in as an account of its own.
/// </summary>
/// <param name="env">The running system.</param>
public sealed class AuthServiceTests(GatewayEnvironment env) : IClassFixture<GatewayEnvironment>, IAsyncDisposable
{
    private const string Password = GatewayEnvironment.Password;

    private readonly List<AsyncServiceScope> scopes = [];

    [Fact]
    public async Task Login_answers_a_session_the_client_contract_recognises()
    {
        var username = await GivenUserAsync();

        var result = await Service().LoginAsync(username, Password, default);

        Assert.False(string.IsNullOrEmpty(result.Session.AccessToken));
        Assert.Equal(900, result.Session.ExpiresIn);
        Assert.Equal(username, result.Session.User.Username);
        Assert.False(string.IsNullOrEmpty(result.RefreshToken));
    }

    [Fact]
    public async Task Login_never_puts_the_refresh_token_in_the_session_body()
    {
        var result = await Service().LoginAsync(await GivenUserAsync(), Password, default);

        Assert.DoesNotContain(result.RefreshToken, Serialize(result.Session), StringComparison.Ordinal);
    }

    [Fact]
    public async Task Login_never_exposes_the_password_hash()
    {
        var result = await Service().LoginAsync(await GivenUserAsync(), Password, default);

        Assert.DoesNotContain("$2", Serialize(result.Session), StringComparison.Ordinal);
    }

    [Fact]
    public async Task Login_expands_the_role_into_the_permissions_the_interface_can_read()
    {
        var result = await Service().LoginAsync(await GivenUserAsync(Role.Viewer), Password, default);

        Assert.Equal(["trade.read"], result.Session.User.Permissions);
    }

    [Fact]
    public async Task Login_rejects_a_wrong_password()
    {
        var username = await GivenUserAsync();

        var problem = await Assert.ThrowsAsync<ApiProblem>(() => Service().LoginAsync(username, "wrong", default));

        Assert.Equal(401, problem.Status);
    }

    [Fact]
    public async Task Login_answers_a_missing_account_exactly_as_it_answers_a_wrong_password()
    {
        var username = await GivenUserAsync();

        var wrongPassword = await Assert.ThrowsAsync<ApiProblem>(() => Service().LoginAsync(username, "wrong", default));
        var missingAccount = await Assert.ThrowsAsync<ApiProblem>(() => Service().LoginAsync(GatewayEnvironment.UniqueUsername(), Password, default));

        Assert.Equal((wrongPassword.Status, wrongPassword.Code, wrongPassword.Message), (missingAccount.Status, missingAccount.Code, missingAccount.Message));
    }

    [Fact]
    public async Task Login_locks_the_account_on_the_failure_that_reaches_the_limit()
    {
        var username = await GivenUserAsync();

        Assert.Equal(LockedOnTheFifth, await FiveWrongPasswordsAsync(username));
        var locked = await Assert.ThrowsAsync<ApiProblem>(() => Service().LoginAsync(username, Password, default));
        Assert.Equal((429, "locked_out"), (locked.Status, locked.Code));
    }

    [Fact]
    public async Task Login_locks_a_username_with_no_account_on_the_same_failure_so_a_lock_reveals_nothing() =>
        Assert.Equal(LockedOnTheFifth, await FiveWrongPasswordsAsync(GatewayEnvironment.UniqueUsername()));

    [Fact]
    public async Task Login_clears_the_failure_count_on_a_success()
    {
        var username = await GivenUserAsync();
        await Assert.ThrowsAsync<ApiProblem>(() => Service().LoginAsync(username, "wrong", default));
        await Service().LoginAsync(username, Password, default);
        for (var failure = 0; failure < 4; failure++)
        {
            await Assert.ThrowsAsync<ApiProblem>(() => Service().LoginAsync(username, "wrong", default));
        }

        Assert.NotNull(await Service().LoginAsync(username, Password, default));
    }

    [Fact]
    public async Task A_stored_hash_made_at_another_cost_is_rehashed_when_the_password_is_correct()
    {
        var username = await GivenUserAsync(passwordHash: Bcrypt.HashPassword(Password, 4));

        await Service().LoginAsync(username, Password, default);

        Assert.Equal("10", Bcrypt.InterrogateHash((await env.FindUserAsync(username))!.PasswordHash).WorkFactor);
        Assert.NotNull(await Service().LoginAsync(username, Password, default));
    }

    [Fact]
    public async Task A_hash_already_at_the_configured_cost_is_left_untouched()
    {
        var username = await GivenUserAsync();
        var original = (await env.FindUserAsync(username))!.PasswordHash;

        await Service().LoginAsync(username, Password, default);

        Assert.Equal(original, (await env.FindUserAsync(username))!.PasswordHash);
    }

    [Fact]
    public async Task A_wrong_password_never_rehashes()
    {
        var original = Bcrypt.HashPassword(Password, 4);
        var username = await GivenUserAsync(passwordHash: original);

        await Assert.ThrowsAsync<ApiProblem>(() => Service().LoginAsync(username, "wrong", default));

        Assert.Equal(original, (await env.FindUserAsync(username))!.PasswordHash);
    }

    [Fact]
    public async Task The_person_is_still_signed_in_when_storing_the_new_hash_fails()
    {
        var original = Bcrypt.HashPassword(Password, 4);
        var username = await GivenUserAsync(passwordHash: original);
        var services = Scope();
        await using var failing = new IdentityDbContext(new DbContextOptionsBuilder<IdentityDbContext>()
            .UseSqlServer(env.IdentityConnection)
            .AddInterceptors(new FailingWrites())
            .Options);
        var service = new AuthService(
            failing,
            services.GetRequiredService<PasswordHasher>(),
            services.GetRequiredService<TokenService>(),
            services.GetRequiredService<RefreshStore>(),
            services.GetRequiredService<LoginAttempts>(),
            services.GetRequiredService<GatewaySettings>(),
            TimeProvider.System,
            NullLogger<AuthService>.Instance);

        Assert.NotNull(await service.LoginAsync(username, Password, default));
        Assert.Equal(original, (await env.FindUserAsync(username))!.PasswordHash);
    }

    [Fact]
    public async Task Refresh_exchanges_a_refresh_token_for_a_new_session()
    {
        var username = await GivenUserAsync();
        var first = await Service().LoginAsync(username, Password, default);

        var session = await Service().RefreshAsync(first.RefreshToken, default);

        Assert.Equal(username, session.Session.User.Username);
        Assert.False(string.IsNullOrEmpty(session.Session.AccessToken));
    }

    [Fact]
    public async Task Refresh_rotates_the_token_so_the_old_one_stops_working()
    {
        var first = await Service().LoginAsync(await GivenUserAsync(), Password, default);

        var second = await Service().RefreshAsync(first.RefreshToken, default);

        Assert.NotEqual(first.RefreshToken, second.RefreshToken);
    }

    [Fact]
    public async Task Refresh_revokes_the_whole_family_when_a_used_token_comes_back()
    {
        var first = await Service().LoginAsync(await GivenUserAsync(), Password, default);
        var second = await Service().RefreshAsync(first.RefreshToken, default);

        var replay = await Assert.ThrowsAsync<ApiProblem>(() => Service().RefreshAsync(first.RefreshToken, default));
        var afterReplay = await Assert.ThrowsAsync<ApiProblem>(() => Service().RefreshAsync(second.RefreshToken, default));

        Assert.Equal(401, replay.Status);
        Assert.Equal(401, afterReplay.Status);
    }

    [Fact]
    public async Task Refresh_refuses_a_missing_token()
    {
        Assert.Equal("No refresh token was supplied", (await Assert.ThrowsAsync<ApiProblem>(() => Service().RefreshAsync(null, default))).Message);
        Assert.Equal(401, (await Assert.ThrowsAsync<ApiProblem>(() => Service().RefreshAsync(string.Empty, default))).Status);
    }

    [Fact]
    public async Task Refresh_refuses_a_token_that_is_not_one_of_ours()
    {
        var problem = await Assert.ThrowsAsync<ApiProblem>(() => Service().RefreshAsync("not-a-token", default));

        Assert.Equal((401, "The refresh token is not valid"), (problem.Status, problem.Message));
    }

    [Fact]
    public async Task Refresh_refuses_a_valid_token_whose_account_has_gone()
    {
        var username = await GivenUserAsync();
        var session = await Service().LoginAsync(username, Password, default);
        await DeleteUserAsync(username);

        var problem = await Assert.ThrowsAsync<ApiProblem>(() => Service().RefreshAsync(session.RefreshToken, default));

        Assert.Equal(401, problem.Status);
    }

    [Fact]
    public async Task Logout_ends_the_session_so_the_refresh_token_stops_working()
    {
        var session = await Service().LoginAsync(await GivenUserAsync(), Password, default);

        await Service().LogoutAsync(session.RefreshToken);

        Assert.Equal(401, (await Assert.ThrowsAsync<ApiProblem>(() => Service().RefreshAsync(session.RefreshToken, default))).Status);
    }

    [Fact]
    public async Task Logout_does_not_complain_about_a_missing_or_invalid_token()
    {
        await Service().LogoutAsync(null);
        await Service().LogoutAsync("not-a-token");
    }

    [Fact]
    public async Task The_current_user_is_the_account_behind_a_token()
    {
        var username = GatewayEnvironment.UniqueUsername();
        var id = await env.AddUserAsync(username, Role.Admin, "MJONES");

        var user = await Service().CurrentUserAsync(id, default);

        Assert.Equal((username, Role.Admin, "MJONES"), (user.Username, user.Role, user.TraderCode));
    }

    [Fact]
    public async Task The_current_user_is_refused_when_the_account_has_gone_since_the_token_was_issued()
    {
        var problem = await Assert.ThrowsAsync<ApiProblem>(() => Service().CurrentUserAsync(Guid.Parse("3f2504e0-4f89-41d3-9a0c-0305e82c3301"), default));

        Assert.Equal((401, "The account on this token no longer exists"), (problem.Status, problem.Message));
    }

    /// <inheritdoc />
    public async ValueTask DisposeAsync()
    {
        foreach (var scope in scopes)
        {
            await scope.DisposeAsync();
        }
    }

    private static readonly (int Status, string Code)[] LockedOnTheFifth =
        [(401, "unauthenticated"), (401, "unauthenticated"), (401, "unauthenticated"), (401, "unauthenticated"), (429, "locked_out")];

    private async Task<(int Status, string Code)[]> FiveWrongPasswordsAsync(string username)
    {
        var outcomes = new List<(int, string)>();
        for (var attempt = 0; attempt < 5; attempt++)
        {
            var problem = await Assert.ThrowsAsync<ApiProblem>(() => Service().LoginAsync(username, "wrong", default));
            outcomes.Add((problem.Status, problem.Code));
        }

        return [.. outcomes];
    }

    private async Task<string> GivenUserAsync(Role role = Role.Trader, string? passwordHash = null)
    {
        var username = GatewayEnvironment.UniqueUsername();
        await env.AddUserAsync(username, role, passwordHash: passwordHash);
        return username;
    }

    private async Task DeleteUserAsync(string username)
    {
        await using var connection = new SqlConnection(env.IdentityConnection);
        await connection.OpenAsync();
        await using var command = new SqlCommand("DELETE FROM app_user WHERE username = @username", connection);
        command.Parameters.AddWithValue("@username", username);
        await command.ExecuteNonQueryAsync();
    }

    /// <summary>A fresh service over a fresh scope, as each request gets.</summary>
    private AuthService Service() => Scope().GetRequiredService<AuthService>();

    private IServiceProvider Scope()
    {
        var scope = env.Gateway.Services.CreateAsyncScope();
        scopes.Add(scope);
        return scope.ServiceProvider;
    }

    private static string Serialize(Wire.AuthSession session) => JsonSerializer.Serialize(session, BlotterJson.Options);

    /// <summary>Fails every write, as a database that went away mid-request would.</summary>
    private sealed class FailingWrites : DbCommandInterceptor
    {
        public override ValueTask<InterceptionResult<int>> NonQueryExecutingAsync(
            DbCommand command,
            CommandEventData eventData,
            InterceptionResult<int> result,
            CancellationToken cancellationToken = default) =>
            throw new InvalidOperationException("the database went away");
    }
}
