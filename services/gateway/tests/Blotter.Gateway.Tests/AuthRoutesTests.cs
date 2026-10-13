using System.Net;
using Blotter.Gateway.Tests.Fixtures;
using Xunit;

namespace Blotter.Gateway.Tests;

/// <summary>
/// The auth routes, ported from the Node API's <c>auth_routes.test.ts</c>. Every test signs in as an
/// account of its own, so a lockout or a burnt session in one test cannot leak into another.
/// </summary>
/// <param name="env">The running system.</param>
public sealed class AuthRoutesTests(GatewayEnvironment env) : IClassFixture<GatewayEnvironment>
{
    private const string LoginPath = "/api/v1/auth/login";
    private const string RefreshPath = "/api/v1/auth/refresh";

    [Fact]
    public async Task Login_is_reachable_without_a_token_unlike_everything_else()
    {
        var username = GatewayEnvironment.UniqueUsername();
        var id = await env.AddUserAsync(username);

        using var response = await env.SendAsync(HttpMethod.Post, LoginPath, json: GatewayEnvironment.Login(username, GatewayEnvironment.Password));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var session = await response.ReadAsync();
        Assert.False(string.IsNullOrEmpty(session.Text("accessToken")));
        Assert.Equal(900, session.GetProperty("expiresIn").GetInt32());
        var user = session.GetProperty("user");
        Assert.Equal(id.ToString(), user.Text("id"));
        Assert.Equal(username, user.Text("username"));
        Assert.Equal(username, user.Text("displayName"));
        Assert.Equal(username.ToUpperInvariant(), user.Text("traderCode"));
        Assert.Equal("TRADER", user.Text("role"));
        Assert.Equal(["trade.read", "trade.create", "trade.amend", "trade.cancel"], user.GetProperty("permissions").EnumerateArray().Select(item => item.GetString()));
    }

    [Fact]
    public async Task Login_puts_the_refresh_token_in_an_http_only_cookie_never_in_the_body()
    {
        var username = GatewayEnvironment.UniqueUsername();
        await env.AddUserAsync(username);

        using var response = await env.SendAsync(HttpMethod.Post, LoginPath, json: GatewayEnvironment.Login(username, GatewayEnvironment.Password));

        var cookie = RefreshCookieHeader(response);
        Assert.Contains("httponly", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("path=/api/v1/auth", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("samesite=lax", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("max-age=604800", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("secure", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("blotter_refresh", await response.Content.ReadAsStringAsync(), StringComparison.Ordinal);
    }

    [Fact]
    public async Task Login_answers_the_same_way_for_a_wrong_password_and_a_missing_account()
    {
        var username = GatewayEnvironment.UniqueUsername();
        await env.AddUserAsync(username);

        using var wrongPassword = await env.SendAsync(HttpMethod.Post, LoginPath, json: GatewayEnvironment.Login(username, "nope"));
        using var missingAccount = await env.SendAsync(HttpMethod.Post, LoginPath, json: GatewayEnvironment.Login(GatewayEnvironment.UniqueUsername(), GatewayEnvironment.Password));

        Assert.Equal(HttpStatusCode.Unauthorized, wrongPassword.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, missingAccount.StatusCode);
        var detail = (await wrongPassword.ReadAsync()).Text("detail");
        Assert.Equal("Username or password is incorrect", detail);
        Assert.Equal(detail, (await missingAccount.ReadAsync()).Text("detail"));
    }

    [Fact]
    public async Task Login_rejects_a_malformed_username_rather_than_looking_it_up()
    {
        using var response = await env.SendAsync(HttpMethod.Post, LoginPath, json: GatewayEnvironment.Login("a user with spaces", GatewayEnvironment.Password));

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Equal(
            [("username", "Username can only use letters, numbers, dots, underscores and dashes")],
            (await response.ReadAsync()).FieldErrors());
    }

    [Fact]
    public async Task Login_locks_on_the_failure_that_reaches_the_limit_and_says_how_long_in_a_retry_after_header()
    {
        var username = GatewayEnvironment.UniqueUsername();
        await env.AddUserAsync(username);

        var outcomes = new List<(HttpStatusCode Status, string Code, string Detail, string? RetryAfter)>();
        for (var attempt = 0; attempt < 5; attempt++)
        {
            using var response = await env.SendAsync(HttpMethod.Post, LoginPath, json: GatewayEnvironment.Login(username, "nope"));
            var problem = await response.ReadAsync();
            outcomes.Add((response.StatusCode, problem.Text("code"), problem.Text("detail"), response.Headers.RetryAfter?.Delta?.TotalSeconds.ToString(System.Globalization.CultureInfo.InvariantCulture)));
        }

        var refused = (HttpStatusCode.Unauthorized, "unauthenticated", "Username or password is incorrect", (string?)null);
        Assert.Equal(
            [refused, refused, refused, refused, (HttpStatusCode.TooManyRequests, "locked_out", "Too many failed attempts. Try again in 900 seconds.", "900")],
            outcomes);

        using var correct = await env.SendAsync(HttpMethod.Post, LoginPath, json: GatewayEnvironment.Login(username, GatewayEnvironment.Password));
        Assert.Equal(HttpStatusCode.TooManyRequests, correct.StatusCode);
        Assert.Equal("locked_out", (await correct.ReadAsync()).Text("code"));
    }

    [Fact]
    public async Task Refresh_exchanges_the_cookie_for_a_new_session()
    {
        var (cookie, _) = await SignInAsync();

        using var response = await Refresh(cookie);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var session = await response.ReadAsync();
        Assert.False(string.IsNullOrEmpty(session.Text("accessToken")));
        Assert.Equal(900, session.GetProperty("expiresIn").GetInt32());
        Assert.NotEqual(cookie, RefreshCookieValue(response));
    }

    [Fact]
    public async Task Refresh_refuses_when_no_cookie_is_sent()
    {
        using var response = await env.SendAsync(HttpMethod.Post, RefreshPath);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("No refresh token was supplied", (await response.ReadAsync()).Text("detail"));
    }

    [Fact]
    public async Task Refresh_burns_the_session_when_a_used_cookie_comes_back()
    {
        var (first, _) = await SignInAsync();
        using var rotation = await Refresh(first);
        var second = RefreshCookieValue(rotation);

        using var replay = await Refresh(first);
        using var afterReplay = await Refresh(second);

        Assert.Equal(HttpStatusCode.Unauthorized, replay.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, afterReplay.StatusCode);
        Assert.Equal("The refresh token is not valid", (await afterReplay.ReadAsync()).Text("detail"));
    }

    [Fact]
    public async Task Me_and_logout_need_a_token_because_they_sit_behind_the_guard()
    {
        using var me = await env.SendAsync(HttpMethod.Get, "/api/v1/auth/me");
        using var logout = await env.SendAsync(HttpMethod.Post, "/api/v1/auth/logout");

        Assert.Equal(HttpStatusCode.Unauthorized, me.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, logout.StatusCode);
        Assert.Equal("Authentication is required", (await me.ReadAsync()).Text("detail"));
    }

    [Fact]
    public async Task Me_describes_the_signed_in_user_permissions_included()
    {
        var (_, accessToken) = await SignInAsync();

        using var response = await env.SendAsync(HttpMethod.Get, "/api/v1/auth/me", accessToken);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var user = await response.ReadAsync();
        var permissions = user.GetProperty("permissions").EnumerateArray().Select(item => item.GetString()).ToList();
        Assert.Equal("TRADER", user.Text("role"));
        Assert.Contains("trade.create", permissions);
        Assert.DoesNotContain("trade.cancel.any", permissions);
    }

    [Fact]
    public async Task Logout_ends_the_session_so_the_refresh_cookie_stops_working()
    {
        var (cookie, accessToken) = await SignInAsync();

        using var logout = await env.SendAsync(HttpMethod.Post, "/api/v1/auth/logout", accessToken, headers: CookieHeader(cookie));
        using var refresh = await Refresh(cookie);

        Assert.Equal(HttpStatusCode.NoContent, logout.StatusCode);
        Assert.Contains("blotter_refresh=;", RefreshCookieHeader(logout), StringComparison.Ordinal);
        Assert.Equal(HttpStatusCode.Unauthorized, refresh.StatusCode);
    }

    private async Task<(string Cookie, string AccessToken)> SignInAsync()
    {
        var username = GatewayEnvironment.UniqueUsername();
        await env.AddUserAsync(username);
        using var response = await env.SendAsync(HttpMethod.Post, LoginPath, json: GatewayEnvironment.Login(username, GatewayEnvironment.Password));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (RefreshCookieValue(response), (await response.ReadAsync()).Text("accessToken"));
    }

    private Task<HttpResponseMessage> Refresh(string cookie) => env.SendAsync(HttpMethod.Post, RefreshPath, headers: CookieHeader(cookie));

    private static Dictionary<string, string> CookieHeader(string value) => new() { ["Cookie"] = $"blotter_refresh={value}" };

    private static string RefreshCookieHeader(HttpResponseMessage response) =>
        response.Headers.TryGetValues("Set-Cookie", out var cookies)
            ? cookies.FirstOrDefault(cookie => cookie.StartsWith("blotter_refresh=", StringComparison.Ordinal)) ?? string.Empty
            : string.Empty;

    private static string RefreshCookieValue(HttpResponseMessage response)
    {
        var header = RefreshCookieHeader(response);
        Assert.NotEmpty(header);
        return header["blotter_refresh=".Length..header.IndexOf(';', StringComparison.Ordinal)];
    }
}
