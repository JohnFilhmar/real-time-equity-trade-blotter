using System.Net;
using Blotter.Gateway.Tests.Fixtures;
using Xunit;

namespace Blotter.Gateway.Tests;

/// <summary>
/// Liveness, readiness, metrics and unmatched routes on a gateway whose database answers, ported from
/// the Node API's <c>health_routes.test.ts</c>. The unreachable-database cases are in
/// <see cref="UnreachableDatabaseTests"/>.
/// </summary>
/// <param name="env">The running system.</param>
public sealed class HealthRoutesTests(GatewayEnvironment env) : IClassFixture<GatewayEnvironment>
{
    [Fact]
    public async Task It_reports_ready_when_the_database_answers()
    {
        using var response = await env.SendAsync(HttpMethod.Get, "/ready");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("{\"status\":\"ready\",\"database\":\"up\"}", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task It_answers_a_probe_without_a_token_because_a_probe_has_no_credentials()
    {
        using var health = await env.SendAsync(HttpMethod.Get, "/health");
        using var ready = await env.SendAsync(HttpMethod.Get, "/ready");

        Assert.Equal(HttpStatusCode.OK, health.StatusCode);
        Assert.Equal(HttpStatusCode.OK, ready.StatusCode);
        var body = await health.ReadAsync();
        Assert.Equal("ok", body.Text("status"));
        Assert.True(body.GetProperty("uptime_seconds").GetInt64() >= 0);
    }

    [Fact]
    public async Task It_will_not_confirm_whether_a_path_under_the_api_prefix_exists()
    {
        using var health = await env.SendAsync(HttpMethod.Get, "/api/v1/health");
        using var unknown = await env.SendAsync(HttpMethod.Get, "/api/v1/not-a-real-route");

        Assert.Equal(HttpStatusCode.Unauthorized, health.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, unknown.StatusCode);
    }

    /// <summary>
    /// The Node API's socket metrics now live in the realtime service, whose suite checks them; the
    /// gateway's own scrape carries the HTTP server metrics.
    /// </summary>
    [Fact]
    public async Task It_exposes_the_prometheus_text_format()
    {
        using var warmUp = await env.SendAsync(HttpMethod.Get, "/health");

        using var response = await env.SendAsync(HttpMethod.Get, "/metrics");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("text/plain", response.Content.Headers.ContentType?.MediaType);
        Assert.Contains("http_server_request_duration_seconds", await response.Content.ReadAsStringAsync(), StringComparison.Ordinal);
    }

    [Fact]
    public async Task An_unmatched_route_answers_a_problem_document_rather_than_a_bare_404()
    {
        using var response = await env.SendAsync(HttpMethod.Get, "/does-not-exist");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        var problem = await response.ReadAsync();
        Assert.Equal("not_found", problem.Text("code"));
        Assert.Contains("/does-not-exist", problem.Text("detail"), StringComparison.Ordinal);
        Assert.Equal("/does-not-exist", problem.Text("instance"));
    }
}

/// <summary>A gateway whose identity database cannot be reached, with nothing seeded.</summary>
/// <param name="sql">The shared SQL Server, which this environment deliberately does not use for identity.</param>
/// <param name="redis">The shared Redis.</param>
public sealed class UnreachableDatabaseEnvironment(SqlServerFixture sql, RedisFixture redis) : GatewayEnvironment(sql, redis)
{
    /// <summary>A password the readiness answer must never repeat.</summary>
    public const string LeakCanary = "hunter2";

    /// <inheritdoc />
    protected override IReadOnlyDictionary<string, string> SettingOverrides { get; } = new Dictionary<string, string>
    {
        ["DATABASE_CONNECTION"] = $"Server=tcp:127.0.0.1,1;Database=identity;User Id=sa;Password={LeakCanary};Encrypt=False;Connect Timeout=1",
        ["SEED_ON_STARTUP"] = "false",
    };
}

/// <summary>Liveness and readiness when the database is down, ported from <c>health_routes.test.ts</c>.</summary>
/// <param name="env">The running system, with no reachable database.</param>
public sealed class UnreachableDatabaseTests(UnreachableDatabaseEnvironment env) : IClassFixture<UnreachableDatabaseEnvironment>
{
    [Fact]
    public async Task It_reports_liveness_without_touching_the_database()
    {
        using var response = await env.SendAsync(HttpMethod.Get, "/health");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("ok", (await response.ReadAsync()).Text("status"));
    }

    [Fact]
    public async Task It_reports_503_when_the_database_is_unreachable()
    {
        using var response = await env.SendAsync(HttpMethod.Get, "/ready");

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.Equal("{\"status\":\"not_ready\",\"database\":\"down\"}", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task It_does_not_leak_the_connection_error_into_the_readiness_response()
    {
        using var response = await env.SendAsync(HttpMethod.Get, "/ready");

        var body = await response.Content.ReadAsStringAsync();
        Assert.DoesNotContain(UnreachableDatabaseEnvironment.LeakCanary, body, StringComparison.Ordinal);
        Assert.DoesNotContain("127.0.0.1", body, StringComparison.Ordinal);
    }
}
