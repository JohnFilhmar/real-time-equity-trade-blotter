using System.Net;
using Blotter.Gateway.Tests.Fixtures;
using Xunit;

namespace Blotter.Gateway.Tests;

/// <summary>Amending a trade, ported from <c>PATCH /api/v1/trades/:trade_id</c> in the Node route tests. A fresh system per test.</summary>
/// <param name="sql">The shared SQL Server.</param>
/// <param name="redis">The shared Redis.</param>
public sealed class TradeAmendTests(SqlServerFixture sql, RedisFixture redis) : GatewayEnvironment(sql, redis)
{
    private const string TradePath = "/api/v1/trades/TRD-100001";

    private static readonly string Jsmith = TestTokens.For("JSMITH");

    [Fact]
    public async Task It_amends_the_trade_and_announces_it()
    {
        await BookAsync(Jsmith);

        using var response = await SendAsync(HttpMethod.Patch, TradePath, Jsmith, "{\"version\":1,\"price\":230.1}");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var trade = await response.ReadAsync();
        Assert.Equal(230.1m, trade.GetProperty("price").GetDecimal());
        Assert.Equal(2, trade.GetProperty("version").GetInt32());
        Assert.Equal(
            ["trade.created", "position.updated", "trade.amended", "trade_event.recorded", "position.updated"],
            await BroadcastsAsync());
    }

    [Fact]
    public async Task It_ignores_an_attempt_to_re_point_the_trade_at_another_instrument()
    {
        await BookAsync(Jsmith);

        using var response = await SendAsync(HttpMethod.Patch, TradePath, Jsmith, "{\"version\":1,\"symbol\":\"MSFT\",\"side\":\"SELL\",\"quantity\":100}");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var trade = await response.ReadAsync();
        Assert.Equal("AAPL", trade.Text("symbol"));
        Assert.Equal("BUY", trade.Text("side"));
        Assert.Equal(100, trade.GetProperty("quantity").GetInt32());
    }

    [Fact]
    public async Task It_answers_422_naming_the_counterparty_and_changes_nothing_when_an_amendment_tries_to_move_it()
    {
        await BookAsync(Jsmith);

        using var response = await SendAsync(HttpMethod.Patch, TradePath, Jsmith, "{\"version\":1,\"quantity\":100,\"counterparty\":\"Nomura\"}");
        using var reread = await SendAsync(HttpMethod.Get, TradePath, Jsmith);

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        var problem = await response.ReadAsync();
        Assert.Equal("validation_failed", problem.Text("code"));
        Assert.Equal([("counterparty", "Counterparty cannot be changed on an amendment. Cancel the trade and book it again.")], problem.FieldErrors());
        Assert.Equal(["trade.created", "position.updated"], await BroadcastsAsync());
        var trade = await reread.ReadAsync();
        Assert.Equal("Goldman Sachs", trade.Text("counterparty"));
        Assert.Equal(5000, trade.GetProperty("quantity").GetInt32());
        Assert.Equal(1, trade.GetProperty("version").GetInt32());
    }

    [Fact]
    public async Task It_answers_409_when_the_version_is_stale()
    {
        await BookAsync(Jsmith);
        using var first = await SendAsync(HttpMethod.Patch, TradePath, Jsmith, "{\"version\":1,\"price\":230.1}");

        using var response = await SendAsync(HttpMethod.Patch, TradePath, Jsmith, "{\"version\":1,\"price\":240}");

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var problem = await response.ReadAsync();
        Assert.Equal("conflict", problem.Text("code"));
        Assert.Equal("Trade TRD-100001 has changed since you loaded it. It is now at version 2. Reload and try again.", problem.Text("detail"));
    }

    [Fact]
    public async Task It_answers_422_for_a_malformed_trade_id_rather_than_404()
    {
        using var response = await SendAsync(HttpMethod.Patch, "/api/v1/trades/nonsense", Jsmith, "{\"version\":1}");

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Equal([("trade_id", "trade id must look like TRD-100001")], (await response.ReadAsync()).FieldErrors());
    }
}
