using System.Net;
using Blotter.Contracts.Wire;
using Blotter.Gateway.Tests.Fixtures;
using Xunit;

namespace Blotter.Gateway.Tests;

/// <summary>One trade's audit trail, ported from <c>GET /api/v1/trades/:trade_id/events</c> in the Node route tests. A fresh system per test.</summary>
/// <param name="sql">The shared SQL Server.</param>
/// <param name="redis">The shared Redis.</param>
public sealed class TradeHistoryTests(SqlServerFixture sql, RedisFixture redis) : GatewayEnvironment(sql, redis)
{
    private const string HistoryPath = "/api/v1/trades/TRD-100001/events";

    private static readonly string Jsmith = TestTokens.For("JSMITH");

    [Fact]
    public async Task A_trade_that_never_changed_has_an_empty_history()
    {
        await BookAsync(Jsmith);

        using var response = await SendAsync(HttpMethod.Get, HistoryPath, Jsmith);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("[]", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task An_amendment_is_recorded_against_whoever_made_it()
    {
        await BookAsync(Jsmith);
        using var amend = await SendAsync(HttpMethod.Patch, "/api/v1/trades/TRD-100001", Jsmith, "{\"version\":1,\"quantity\":7500}");

        using var response = await SendAsync(HttpMethod.Get, HistoryPath, Jsmith);

        var history = await response.ReadAsync();
        var recorded = Assert.Single(history.EnumerateArray());
        Assert.True(Guid.TryParse(recorded.Text("id"), out _));
        Assert.Equal("TRD-100001", recorded.Text("tradeId"));
        Assert.Equal(2, recorded.GetProperty("version").GetInt32());
        Assert.Equal("AMENDED", recorded.Text("action"));
        Assert.Equal("API", recorded.Text("source"));
        Assert.Equal("JSMITH", recorded.Text("actor"));
        Assert.Equal("{\"quantity\":{\"from\":5000,\"to\":7500}}", recorded.GetProperty("changes").GetRawText());
        Assert.Matches(@"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$", recorded.Text("occurredAt"));
    }

    [Fact]
    public async Task A_cancellation_is_recorded_against_whoever_made_it_even_an_administrator()
    {
        await BookAsync(Jsmith);
        using var cancel = await SendAsync(HttpMethod.Post, "/api/v1/trades/TRD-100001/cancel", TestTokens.For("MJONES", Role.Admin), "{}");

        using var response = await SendAsync(HttpMethod.Get, HistoryPath, Jsmith);

        var recorded = Assert.Single((await response.ReadAsync()).EnumerateArray());
        Assert.Equal("CANCELLED", recorded.Text("action"));
        Assert.Equal("MJONES", recorded.Text("actor"));
        Assert.Equal("{\"status\":{\"from\":\"ACTIVE\",\"to\":\"CANCELLED\"}}", recorded.GetProperty("changes").GetRawText());
    }
}
