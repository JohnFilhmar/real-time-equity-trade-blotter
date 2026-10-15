using System.Net;
using Blotter.Contracts.Wire;
using Blotter.Gateway.Tests.Fixtures;
using Xunit;

namespace Blotter.Gateway.Tests;

/// <summary>
/// Who may reach the trade routes and what they may do there, ported from the authentication and
/// authorisation blocks of the Node API's <c>trade_routes.test.ts</c>. A fresh system per test.
/// </summary>
/// <param name="sql">The shared SQL Server.</param>
/// <param name="redis">The shared Redis.</param>
public sealed class TradeAccessTests(SqlServerFixture sql, RedisFixture redis) : GatewayEnvironment(sql, redis)
{
    /// <summary>Every trade route, with a body where it takes one.</summary>
    /// <returns>Method, path and body.</returns>
    public static TheoryData<string, string, string?> TradeRoutes() => new()
    {
        { "GET", "/api/v1/trades", null },
        { "GET", "/api/v1/trades/TRD-100001", null },
        { "POST", "/api/v1/trades", Payloads.Ticket() },
        { "PATCH", "/api/v1/trades/TRD-100001", "{\"version\":1,\"quantity\":1}" },
        { "POST", "/api/v1/trades/TRD-100001/cancel", "{}" },
        { "GET", "/api/v1/trades/TRD-100001/events", null },
    };

    [Theory]
    [MemberData(nameof(TradeRoutes))]
    public async Task Every_trade_route_refuses_a_request_without_a_token(string method, string path, string? body)
    {
        using var response = await SendAsync(new HttpMethod(method), path, json: body);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("unauthenticated", (await response.ReadAsync()).Text("code"));
    }

    [Fact]
    public async Task A_token_that_is_not_ours_is_refused()
    {
        using var response = await SendAsync(HttpMethod.Get, "/api/v1/trades", "not-a-real-token");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("The access token is not valid", (await response.ReadAsync()).Text("detail"));
    }

    [Fact]
    public async Task An_authorization_header_that_is_not_a_bearer_is_refused()
    {
        using var response = await SendAsync(HttpMethod.Get, "/api/v1/trades", headers: new Dictionary<string, string> { ["Authorization"] = "Basic anNtaXRoOnBhc3N3b3Jk" });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("Authentication is required", (await response.ReadAsync()).Text("detail"));
    }

    [Fact]
    public async Task A_viewer_may_read_but_not_write()
    {
        var viewer = TestTokens.For("VIEWER", Role.Viewer);

        using var read = await SendAsync(HttpMethod.Get, "/api/v1/trades", viewer);
        using var write = await SendAsync(HttpMethod.Post, "/api/v1/trades", viewer, Payloads.Ticket());

        Assert.Equal(HttpStatusCode.OK, read.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, write.StatusCode);
        var problem = await write.ReadAsync();
        Assert.Equal("forbidden", problem.Text("code"));
        Assert.Equal("This action requires the trade.create permission", problem.Text("detail"));
    }

    [Fact]
    public async Task A_trader_cannot_amend_somebody_elses_trade()
    {
        await BookAsync(TestTokens.For("JSMITH"));

        using var response = await SendAsync(HttpMethod.Patch, "/api/v1/trades/TRD-100001", TestTokens.For("ABROWN"), "{\"version\":1,\"quantity\":100}");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal("Only JSMITH or an administrator can amend this trade", (await response.ReadAsync()).Text("detail"));
    }

    [Fact]
    public async Task A_trader_cannot_cancel_another_desks_trade()
    {
        await BookAsync(TestTokens.For("JSMITH"));

        using var response = await SendAsync(HttpMethod.Post, "/api/v1/trades/TRD-100001/cancel", TestTokens.For("ABROWN"), "{}");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal("Only JSMITH or an administrator can cancel this trade", (await response.ReadAsync()).Text("detail"));
    }

    [Fact]
    public async Task An_administrator_may_act_on_anyones_trade()
    {
        await BookAsync(TestTokens.For("JSMITH"));
        var admin = TestTokens.For("MJONES", Role.Admin);

        using var amend = await SendAsync(HttpMethod.Patch, "/api/v1/trades/TRD-100001", admin, "{\"version\":1,\"quantity\":100}");
        using var cancel = await SendAsync(HttpMethod.Post, "/api/v1/trades/TRD-100001/cancel", admin, "{}");

        Assert.Equal(HttpStatusCode.OK, amend.StatusCode);
        Assert.Equal(HttpStatusCode.OK, cancel.StatusCode);
    }
}
