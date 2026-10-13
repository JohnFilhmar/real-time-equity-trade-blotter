using System.Globalization;
using System.Net;
using Blotter.Gateway.Tests.Fixtures;
using Xunit;

namespace Blotter.Gateway.Tests;

/// <summary>A gateway with limits low enough to reach in a test: 3 credential requests, 5 reads and 2 writes a minute.</summary>
/// <param name="sql">The shared SQL Server.</param>
/// <param name="redis">The shared Redis.</param>
public sealed class StrictLimitsEnvironment(SqlServerFixture sql, RedisFixture redis) : GatewayEnvironment(sql, redis)
{
    /// <inheritdoc />
    protected override IReadOnlyDictionary<string, string> SettingOverrides { get; } = new Dictionary<string, string>
    {
        ["AUTH_RATE_LIMIT"] = "3",
        ["READ_RATE_LIMIT"] = "5",
        ["WRITE_RATE_LIMIT"] = "2",
    };
}

/// <summary>
/// The three Redis-backed tiers: credentials per address, reads per user, writes per user on top of
/// reads. Each test uses its own address or its own minted user, so the windows never overlap.
/// </summary>
/// <param name="env">The running system, with strict limits.</param>
public sealed class RateLimitTests(StrictLimitsEnvironment env) : IClassFixture<StrictLimitsEnvironment>
{
    [Fact]
    public async Task The_credential_endpoints_are_limited_per_address()
    {
        var address = Address();
        var remaining = new List<string>();
        for (var attempt = 0; attempt < 3; attempt++)
        {
            using var allowed = await env.SendAsync(HttpMethod.Post, "/api/v1/auth/refresh", headers: address);
            Assert.Equal(HttpStatusCode.Unauthorized, allowed.StatusCode);
            remaining.Add(Assert.Single(allowed.Headers.GetValues("RateLimit")).Split(", ")[1]);
        }

        using var refused = await env.SendAsync(HttpMethod.Post, "/api/v1/auth/refresh", headers: address);
        using var elsewhere = await env.SendAsync(HttpMethod.Post, "/api/v1/auth/refresh", headers: Address());

        Assert.Equal(["remaining=2", "remaining=1", "remaining=0"], remaining);
        Assert.Equal(HttpStatusCode.TooManyRequests, refused.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, elsewhere.StatusCode);
    }

    [Fact]
    public async Task A_refusal_is_a_rate_limited_problem_with_a_retry_after_header()
    {
        var address = Address();
        for (var attempt = 0; attempt < 3; attempt++)
        {
            using var allowed = await env.SendAsync(HttpMethod.Post, "/api/v1/auth/login", json: GatewayEnvironment.Login("nobody", "x"), headers: address);
        }

        using var refused = await env.SendAsync(HttpMethod.Post, "/api/v1/auth/login", json: GatewayEnvironment.Login("nobody", "x"), headers: address);

        Assert.Equal(HttpStatusCode.TooManyRequests, refused.StatusCode);
        Assert.Equal("application/problem+json", refused.Content.Headers.ContentType?.MediaType);
        var problem = await refused.ReadAsync();
        Assert.Equal("rate_limited", problem.Text("code"));
        Assert.Equal("Too many requests", problem.Text("title"));
        Assert.Equal("Too many requests. Try again shortly.", problem.Text("detail"));
        Assert.Equal("/api/v1/auth/login", problem.Text("instance"));
        Assert.InRange(refused.Headers.RetryAfter?.Delta?.TotalSeconds ?? 0, 1, 60);
        Assert.StartsWith("limit=3, remaining=0, reset=", Assert.Single(refused.Headers.GetValues("RateLimit")), StringComparison.Ordinal);
    }

    [Fact]
    public async Task Reads_are_limited_per_user_not_per_address()
    {
        var token = TestTokens.For("JSMITH");
        for (var read = 0; read < 5; read++)
        {
            using var allowed = await env.SendAsync(HttpMethod.Get, "/api/v1/positions", token, headers: Address());
            Assert.Equal(HttpStatusCode.OK, allowed.StatusCode);
            Assert.Equal("5;w=60", Assert.Single(allowed.Headers.GetValues("RateLimit-Policy")));
        }

        using var refused = await env.SendAsync(HttpMethod.Get, "/api/v1/positions", token, headers: Address());
        using var someoneElse = await env.SendAsync(HttpMethod.Get, "/api/v1/positions", TestTokens.For("JSMITH"));

        Assert.Equal(HttpStatusCode.TooManyRequests, refused.StatusCode);
        Assert.Equal(HttpStatusCode.OK, someoneElse.StatusCode);
    }

    [Fact]
    public async Task Writes_have_a_tighter_limit_on_top_of_the_read_limit()
    {
        var token = TestTokens.For("JSMITH");
        for (var write = 0; write < 2; write++)
        {
            using var booked = await env.SendAsync(HttpMethod.Post, "/api/v1/trades", token, Payloads.Ticket());
            Assert.Equal(HttpStatusCode.Created, booked.StatusCode);
            Assert.Equal("2;w=60", Assert.Single(booked.Headers.GetValues("RateLimit-Policy")));
        }

        using var refused = await env.SendAsync(HttpMethod.Post, "/api/v1/trades", token, Payloads.Ticket());
        using var read = await env.SendAsync(HttpMethod.Get, "/api/v1/positions", token);

        Assert.Equal(HttpStatusCode.TooManyRequests, refused.StatusCode);
        Assert.Equal(HttpStatusCode.OK, read.StatusCode);
    }

    [Fact]
    public async Task The_operational_endpoints_are_never_limited()
    {
        for (var probe = 0; probe < 8; probe++)
        {
            using var ready = await env.SendAsync(HttpMethod.Get, "/ready");
            Assert.Equal(HttpStatusCode.OK, ready.StatusCode);
            Assert.False(ready.Headers.Contains("RateLimit"));
        }
    }

    private static Dictionary<string, string> Address() => new()
    {
        ["X-Forwarded-For"] = string.Create(CultureInfo.InvariantCulture, $"10.{Random.Shared.Next(256)}.{Random.Shared.Next(256)}.{Random.Shared.Next(1, 255)}"),
    };
}
