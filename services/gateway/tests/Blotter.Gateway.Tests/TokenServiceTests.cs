using System.Net;
using System.Security.Claims;
using Blotter.Gateway.Auth;
using Blotter.Gateway.Settings;
using Blotter.Gateway.Tests.Fixtures;
using Blotter.ServiceDefaults.Auth;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using Xunit;

namespace Blotter.Gateway.Tests;

/// <summary>
/// Access and refresh tokens, ported from the Node API's <c>tokens.test.ts</c>. Where the Node tests
/// called <c>verify_access_token</c>, these present the token to a guarded route, so the check under
/// test is the gateway's real bearer configuration rather than a copy of it.
/// </summary>
/// <param name="env">The running system.</param>
public sealed class TokenServiceTests(GatewayEnvironment env) : IClassFixture<GatewayEnvironment>
{
    private static readonly TokenService Tokens = new(
        new GatewaySettings
        {
            JwtAccessSecret = GatewayEnvironment.AccessSecret,
            JwtRefreshSecret = GatewayEnvironment.RefreshSecret,
            AccessTokenTtlSeconds = 900,
            RefreshTokenTtlSeconds = 604_800,
        },
        TimeProvider.System);

    [Fact]
    public async Task An_access_token_round_trips_the_claims_it_was_given()
    {
        var user = (await env.FindUserAsync("jsmith"))!;
        var token = Tokens.IssueAccess(user);

        var read = new JsonWebTokenHandler().ReadJsonWebToken(token);
        Assert.Equal(user.Id.ToString(), read.GetClaim(AccessClaims.SubjectClaim).Value);
        Assert.Equal("jsmith", read.GetClaim(AccessClaims.UsernameClaim).Value);
        Assert.Equal("JSMITH", read.GetClaim(AccessClaims.TraderCodeClaim).Value);
        Assert.Equal("TRADER", read.GetClaim(AccessClaims.RoleClaim).Value);
        Assert.Equal(HttpStatusCode.OK, await StatusWithAsync(token));
    }

    [Fact]
    public async Task An_access_token_signed_with_another_secret_is_refused() =>
        Assert.Equal(HttpStatusCode.Unauthorized, await StatusWithAsync(Mint(secret: "a-different-secret-entirely-0123456789")));

    [Fact]
    public async Task An_access_token_that_claims_to_need_no_signature_is_refused() =>
        Assert.Equal(HttpStatusCode.Unauthorized, await StatusWithAsync(Mint(secret: null)));

    [Fact]
    public async Task An_access_token_issued_by_something_else_is_refused() =>
        Assert.Equal(HttpStatusCode.Unauthorized, await StatusWithAsync(Mint(issuer: "somewhere-else")));

    [Fact]
    public async Task An_expired_access_token_is_refused() =>
        Assert.Equal(HttpStatusCode.Unauthorized, await StatusWithAsync(Mint(lifetime: TimeSpan.FromSeconds(-10))));

    [Fact]
    public async Task A_correctly_signed_access_token_whose_claims_are_the_wrong_shape_is_refused() =>
        Assert.Equal(HttpStatusCode.Unauthorized, await StatusWithAsync(Mint(role: "SUPERUSER")));

    [Fact]
    public async Task A_refresh_token_presented_as_an_access_token_is_refused() =>
        Assert.Equal(HttpStatusCode.Unauthorized, await StatusWithAsync(Tokens.IssueRefresh(Guid.NewGuid(), Guid.NewGuid()).Token));

    [Fact]
    public async Task Nonsense_is_refused()
    {
        Assert.Equal(HttpStatusCode.Unauthorized, await StatusWithAsync("not-a-token"));
        Assert.Equal(HttpStatusCode.Unauthorized, await StatusWithAsync(string.Empty));
    }

    [Fact]
    public async Task A_refresh_token_carries_the_family_and_a_fresh_id_each_time()
    {
        var user = Guid.NewGuid();
        var family = Guid.NewGuid();

        var first = Tokens.IssueRefresh(user, family);
        var second = Tokens.IssueRefresh(user, family);

        Assert.Equal(family, (await Tokens.ValidateRefreshAsync(first.Token))!.Family);
        Assert.Equal(family, (await Tokens.ValidateRefreshAsync(second.Token))!.Family);
        Assert.NotEqual(first.TokenId, second.TokenId);
    }

    [Fact]
    public async Task A_refresh_token_round_trips_its_claims()
    {
        var user = Guid.NewGuid();
        var family = Guid.NewGuid();
        var issued = Tokens.IssueRefresh(user, family);

        var claims = await Tokens.ValidateRefreshAsync(issued.Token);

        Assert.Equal(new RefreshClaims(user, family, issued.TokenId), claims);
    }

    [Fact]
    public async Task An_access_token_presented_as_a_refresh_token_is_refused()
    {
        var user = (await env.FindUserAsync("jsmith"))!;

        Assert.Null(await Tokens.ValidateRefreshAsync(Tokens.IssueAccess(user)));
    }

    private async Task<HttpStatusCode> StatusWithAsync(string token)
    {
        using var response = await env.SendAsync(HttpMethod.Get, "/api/v1/positions", headers: new Dictionary<string, string> { ["Authorization"] = $"Bearer {token}" });
        return response.StatusCode;
    }

    /// <summary>Signs a token by hand, so each test can break exactly one thing about it. A null secret leaves it unsigned.</summary>
    private static string Mint(string? secret = GatewayEnvironment.AccessSecret, string issuer = AccessTokens.Issuer, string role = "TRADER", TimeSpan? lifetime = null)
    {
        var now = DateTime.UtcNow;
        var expires = now + (lifetime ?? TimeSpan.FromMinutes(15));
        return new JsonWebTokenHandler { SetDefaultTimesOnTokenCreation = false }.CreateToken(new SecurityTokenDescriptor
        {
            Issuer = issuer,
            Audience = AccessTokens.Audience,
            IssuedAt = expires < now ? expires.AddMinutes(-1) : now,
            Expires = expires,
            Subject = new ClaimsIdentity(
            [
                new Claim(AccessClaims.SubjectClaim, Guid.NewGuid().ToString()),
                new Claim(AccessClaims.UsernameClaim, "jsmith"),
                new Claim(AccessClaims.TraderCodeClaim, "JSMITH"),
                new Claim(AccessClaims.RoleClaim, role),
            ]),
            SigningCredentials = secret is null ? null : new SigningCredentials(AccessTokens.SigningKey(secret), SecurityAlgorithms.HmacSha256),
        });
    }
}
