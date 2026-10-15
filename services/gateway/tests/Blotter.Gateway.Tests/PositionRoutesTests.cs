using System.Net;
using System.Text.Json;
using Blotter.Contracts.Wire;
using Blotter.Gateway.Tests.Fixtures;
using Xunit;

namespace Blotter.Gateway.Tests;

/// <summary>The positions route, ported from the Node API's <c>position_routes.test.ts</c>. A fresh system per test.</summary>
/// <param name="sql">The shared SQL Server.</param>
/// <param name="redis">The shared Redis.</param>
public sealed class PositionRoutesTests(SqlServerFixture sql, RedisFixture redis) : GatewayEnvironment(sql, redis)
{
    private const string PositionsPath = "/api/v1/positions";

    private static readonly string Jsmith = TestTokens.For("JSMITH");

    [Fact]
    public async Task It_refuses_the_request_without_a_token()
    {
        using var response = await SendAsync(HttpMethod.Get, PositionsPath);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("unauthenticated", (await response.ReadAsync()).Text("code"));
    }

    [Fact]
    public async Task A_viewer_may_read_and_every_row_satisfies_the_shared_contract()
    {
        await BookAsync("AAPL", "BUY", 5000);

        var rows = await ReadPositionsAsync(TestTokens.For("VIEWER", Role.Viewer));

        var row = Assert.Single(rows);
        Assert.Equal(
            ["averagePrice", "buyQuantity", "currency", "grossNotional", "netQuantity", "realisedPnl", "sellQuantity", "symbol", "tradeCount"],
            row.EnumerateObject().Select(property => property.Name).Order(StringComparer.Ordinal));
    }

    [Fact]
    public async Task It_nets_the_buys_against_the_sells()
    {
        await BookAsync("AAPL", "BUY", 5000);
        await BookAsync("AAPL", "SELL", 2000);

        var row = Assert.Single(await ReadPositionsAsync(Jsmith));

        Assert.Equal("AAPL", row.Text("symbol"));
        Assert.Equal("USD", row.Text("currency"));
        Assert.Equal(5000, row.GetProperty("buyQuantity").GetInt64());
        Assert.Equal(2000, row.GetProperty("sellQuantity").GetInt64());
        Assert.Equal(3000, row.GetProperty("netQuantity").GetInt64());
        Assert.Equal(2, row.GetProperty("tradeCount").GetInt32());
        Assert.Equal(100m, row.GetProperty("averagePrice").GetDecimal());
        Assert.Equal(0m, row.GetProperty("realisedPnl").GetDecimal());
        Assert.Equal(700_000m, row.GetProperty("grossNotional").GetDecimal());
    }

    [Fact]
    public async Task It_does_not_count_a_cancelled_trade()
    {
        await BookAsync("MSFT", "BUY", 1000);
        var second = await BookAsync("MSFT", "BUY", 9000);
        using var cancel = await SendAsync(HttpMethod.Post, $"/api/v1/trades/{second.Text("tradeId")}/cancel", Jsmith, "{}");
        Assert.Equal(HttpStatusCode.OK, cancel.StatusCode);

        var row = Assert.Single(await ReadPositionsAsync(Jsmith));

        Assert.Equal(1000, row.GetProperty("buyQuantity").GetInt64());
        Assert.Equal(1000, row.GetProperty("netQuantity").GetInt64());
        Assert.Equal(1, row.GetProperty("tradeCount").GetInt32());
    }

    [Fact]
    public async Task It_sorts_the_rows_by_symbol()
    {
        foreach (var symbol in new[] { "TSLA", "AAPL", "MSFT" })
        {
            await BookAsync(symbol, "BUY", 100);
        }

        var rows = await ReadPositionsAsync(Jsmith);

        Assert.Equal(["AAPL", "MSFT", "TSLA"], rows.Select(row => row.Text("symbol")));
    }

    private Task<JsonElement> BookAsync(string symbol, string side, int quantity) => BookAsync(Jsmith, Payloads.Ticket(
        ("symbol", symbol), ("side", side), ("quantity", quantity), ("price", 100), ("book", "EQUITIES_US")));

    private async Task<List<JsonElement>> ReadPositionsAsync(string token)
    {
        using var response = await SendAsync(HttpMethod.Get, PositionsPath, token);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return [.. (await response.ReadAsync()).EnumerateArray()];
    }
}
