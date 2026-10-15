using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.RegularExpressions;
using Blotter.Gateway.Tests.Fixtures;
using Xunit;

namespace Blotter.Gateway.Tests;

/// <summary>
/// What every response at the edge promises, whichever route produced it: one problem shape, the
/// correlation id, the unmatched-route answers, the body limits, the rate-limit headers the
/// frontend's end-to-end suite paces itself by, and CORS for the one allowed origin.
/// </summary>
/// <param name="env">The running system.</param>
public sealed partial class EdgeContractTests(GatewayEnvironment env) : IClassFixture<GatewayEnvironment>
{
    [Fact]
    public async Task An_unknown_api_path_without_a_token_is_401_so_the_api_cannot_be_mapped()
    {
        using var response = await env.SendAsync(HttpMethod.Get, "/api/v1/nope?x=1");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("/problems/unauthenticated", problem.GetProperty("type").GetString());
        Assert.Equal("Authentication required", problem.GetProperty("title").GetString());
        Assert.Equal(401, problem.GetProperty("status").GetInt32());
        Assert.Equal("Authentication is required", problem.GetProperty("detail").GetString());
        Assert.Equal("/api/v1/nope?x=1", problem.GetProperty("instance").GetString());
        Assert.Equal("unauthenticated", problem.GetProperty("code").GetString());
        Assert.False(problem.TryGetProperty("errors", out _), "errors must be left out, not sent as null");
    }

    [Fact]
    public async Task An_unknown_api_path_with_a_token_is_a_404_naming_the_method_and_path()
    {
        using var response = await env.SendAsync(HttpMethod.Delete, "/api/v1/trades/TRD-100001?force=1", await env.TokenAsync("jsmith"));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("not_found", problem.GetProperty("code").GetString());
        Assert.Equal("Resource not found", problem.GetProperty("title").GetString());
        Assert.Equal("No route matches DELETE /api/v1/trades/TRD-100001", problem.GetProperty("detail").GetString());
        Assert.Equal("/api/v1/trades/TRD-100001?force=1", problem.GetProperty("instance").GetString());
    }

    [Theory]
    [InlineData("/nope")]
    [InlineData("/favicon.ico")]
    [InlineData("/")]
    public async Task A_path_outside_the_api_is_an_anonymous_404_problem(string path)
    {
        using var response = await env.SendAsync(HttpMethod.Get, path);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal($"No route matches GET {path}", problem.GetProperty("detail").GetString());
    }

    [Fact]
    public async Task A_bad_token_is_told_apart_from_a_missing_one()
    {
        using var response = await env.SendAsync(HttpMethod.Get, "/api/v1/trades", token: "not-a-jwt");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("The access token is not valid", problem.GetProperty("detail").GetString());
        Assert.False(response.Headers.Contains("WWW-Authenticate"));
    }

    [Fact]
    public async Task A_safe_request_id_is_echoed_on_the_header_and_in_the_problem()
    {
        using var response = await env.SendAsync(HttpMethod.Get, "/api/v1/trades", headers: new Dictionary<string, string> { ["x-request-id"] = "abc-123.def:ghi" });

        Assert.Equal("abc-123.def:ghi", Assert.Single(response.Headers.GetValues("x-request-id")));
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("abc-123.def:ghi", problem.GetProperty("request_id").GetString());
    }

    [Theory]
    [InlineData("/api/v1/trades/TRD-999999", true, 404)]
    [InlineData("/api/v1/trades?limit=5000", true, 422)]
    [InlineData("/api/v1/trades", false, 401)]
    public async Task Every_failure_is_an_rfc_9457_problem_document(string path, bool signedIn, int status)
    {
        using var response = await env.SendAsync(HttpMethod.Get, path, signedIn ? TestTokens.For("JSMITH") : null);

        Assert.Equal(status, (int)response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        var problem = await response.ReadAsync();
        Assert.StartsWith("/problems/", problem.Text("type"), StringComparison.Ordinal);
        Assert.Equal(status, problem.GetProperty("status").GetInt32());
    }

    [Fact]
    public async Task A_problem_carries_the_correlation_id_the_response_header_advertises()
    {
        using var response = await env.SendAsync(HttpMethod.Get, "/api/v1/trades/TRD-999999", TestTokens.For("JSMITH"), headers: new Dictionary<string, string> { ["x-request-id"] = "test-correlation-id" });

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("test-correlation-id", Assert.Single(response.Headers.GetValues("x-request-id")));
        var problem = await response.ReadAsync();
        Assert.Equal("test-correlation-id", problem.Text("request_id"));
        Assert.Equal("trade TRD-999999 was not found", problem.Text("detail"));
    }

    [Fact]
    public async Task An_unsafe_request_id_is_replaced_rather_than_logged()
    {
        using var response = await env.SendAsync(HttpMethod.Get, "/health", headers: new Dictionary<string, string> { ["x-request-id"] = "bad id\twith spaces" });

        var id = Assert.Single(response.Headers.GetValues("x-request-id"));
        Assert.True(Guid.TryParse(id, out _), $"expected a generated uuid, got {id}");
    }

    [Fact]
    public async Task An_error_keeps_the_security_headers()
    {
        using var response = await env.SendAsync(HttpMethod.Get, "/api/v1/trades");

        Assert.Equal("nosniff", Assert.Single(response.Headers.GetValues("X-Content-Type-Options")));
        Assert.Equal("DENY", Assert.Single(response.Headers.GetValues("X-Frame-Options")));
        Assert.False(response.Headers.Contains("Server"));
    }

    [Fact]
    public async Task A_body_that_is_not_json_is_a_400_not_a_500()
    {
        using var response = await env.SendAsync(HttpMethod.Post, "/api/v1/trades", await env.TokenAsync("jsmith"), json: "{\"symbol\":");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("validation_failed", problem.GetProperty("code").GetString());
        Assert.Equal("The request body is not valid JSON.", problem.GetProperty("detail").GetString());
    }

    [Fact]
    public async Task A_body_over_100_kb_is_a_413_not_a_500()
    {
        var json = $"{{\"book\":\"{new string('x', 110 * 1024)}\"}}";
        using var response = await env.SendAsync(HttpMethod.Post, "/api/v1/trades", await env.TokenAsync("jsmith"), json: json);

        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("The request body is larger than 100 kB.", problem.GetProperty("detail").GetString());
    }

    /// <summary>The frontend's ensure_auth_budget helper probes a cookieless refresh and reads this header.</summary>
    [Fact]
    public async Task A_refused_refresh_still_carries_the_draft_7_rate_limit_headers()
    {
        using var response = await env.SendAsync(HttpMethod.Post, "/api/v1/auth/refresh", headers: new Dictionary<string, string> { ["X-Forwarded-For"] = "10.20.30.40" });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        var header = Assert.Single(response.Headers.GetValues("RateLimit"));
        var match = RateLimitHeader().Match(header);
        Assert.True(match.Success, $"unexpected RateLimit header: {header}");
        Assert.Equal("10000", match.Groups[1].Value);
        Assert.Equal("9999", match.Groups[2].Value);
        Assert.InRange(int.Parse(match.Groups[3].Value, System.Globalization.CultureInfo.InvariantCulture), 1, 60);
        Assert.Equal("10000;w=60", Assert.Single(response.Headers.GetValues("RateLimit-Policy")));
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("No refresh token was supplied", problem.GetProperty("detail").GetString());
    }

    [Fact]
    public async Task A_preflight_from_the_allowed_origin_is_answered_with_credentials()
    {
        using var response = await env.SendAsync(HttpMethod.Options, "/api/v1/trades", headers: new Dictionary<string, string>
        {
            ["Origin"] = GatewayEnvironment.AllowedOrigin,
            ["Access-Control-Request-Method"] = "PATCH",
            ["Access-Control-Request-Headers"] = "authorization,content-type",
        });

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal(GatewayEnvironment.AllowedOrigin, Assert.Single(response.Headers.GetValues("Access-Control-Allow-Origin")));
        Assert.Equal("true", Assert.Single(response.Headers.GetValues("Access-Control-Allow-Credentials")));
        Assert.Contains("PATCH", Assert.Single(response.Headers.GetValues("Access-Control-Allow-Methods")), StringComparison.Ordinal);
    }

    [Fact]
    public async Task Another_origin_gets_no_cors_grant()
    {
        using var response = await env.SendAsync(HttpMethod.Options, "/api/v1/trades", headers: new Dictionary<string, string>
        {
            ["Origin"] = "https://evil.example",
            ["Access-Control-Request-Method"] = "GET",
        });

        Assert.False(response.Headers.Contains("Access-Control-Allow-Origin"));
    }

    [GeneratedRegex(@"^limit=(\d+),\s*remaining=(\d+),\s*reset=(\d+)$")]
    private static partial Regex RateLimitHeader();
}
