using System.Globalization;
using System.Net;
using System.Text.Json;
using Blotter.Gateway.Tests.Fixtures;
using Xunit;

namespace Blotter.Gateway.Tests;

/// <summary>Booking a trade, ported from <c>POST /api/v1/trades</c> in the Node route tests. A fresh system per test.</summary>
/// <param name="sql">The shared SQL Server.</param>
/// <param name="redis">The shared Redis.</param>
public sealed class TradeBookingTests(SqlServerFixture sql, RedisFixture redis) : GatewayEnvironment(sql, redis)
{
    [Fact]
    public async Task It_books_the_trade_under_the_token_holders_desk_code()
    {
        var trade = await BookAsync(TestTokens.For("ABROWN"));

        Assert.Equal("TRD-100001", trade.Text("tradeId"));
        Assert.Equal("ABROWN", trade.Text("trader"));
        Assert.Equal("ACTIVE", trade.Text("status"));
        Assert.Equal(1, trade.GetProperty("version").GetInt32());
        Assert.True(Guid.TryParse(trade.Text("id"), out _));
        Assert.Equal(["trade.created", "position.updated"], await BroadcastsAsync());
    }

    [Fact]
    public async Task It_ignores_a_trader_the_client_tries_to_supply()
    {
        var trade = await BookAsync(TestTokens.For("ABROWN"), Payloads.Ticket(("trader", "SOMEONE_ELSE")));

        Assert.Equal("ABROWN", trade.Text("trader"));
    }

    [Fact]
    public async Task It_serialises_price_as_a_json_number_and_stamps_the_instrument_currency()
    {
        var trade = await BookAsync(TestTokens.For("JSMITH"));

        Assert.Equal(JsonValueKind.Number, trade.GetProperty("price").ValueKind);
        Assert.Equal(227.45m, trade.GetProperty("price").GetDecimal());
        Assert.Equal("USD", trade.Text("currency"));
    }

    [Fact]
    public async Task It_rejects_a_symbol_outside_the_tradable_universe()
    {
        using var response = await SendAsync(HttpMethod.Post, "/api/v1/trades", TestTokens.For("JSMITH"), Payloads.Ticket(("symbol", "ZZZZ")));

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Equal([("symbol", "Choose a symbol from the list")], (await response.ReadAsync()).FieldErrors());
        Assert.Empty(await BroadcastsAsync());
    }

    [Fact]
    public async Task It_rejects_a_trade_booked_in_the_future()
    {
        var tomorrow = DateTimeOffset.UtcNow.AddDays(1).ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);

        using var response = await SendAsync(HttpMethod.Post, "/api/v1/trades", TestTokens.For("JSMITH"), Payloads.Ticket(("tradeTimestamp", tomorrow)));

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Contains(("tradeTimestamp", "Trade time cannot be in the future"), (await response.ReadAsync()).FieldErrors());
    }

    [Fact]
    public async Task It_explains_a_broken_rule_in_the_words_the_ticket_shows()
    {
        using var response = await SendAsync(HttpMethod.Post, "/api/v1/trades", TestTokens.For("JSMITH"), Payloads.Ticket(("quantity", 0), ("counterparty", string.Empty)));

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Equal(
            [("quantity", "Quantity must be a whole number above zero"), ("counterparty", "Enter a counterparty")],
            (await response.ReadAsync()).FieldErrors());
    }

    [Fact]
    public async Task It_rejects_a_ticket_over_the_desk_notional_limit()
    {
        using var response = await SendAsync(HttpMethod.Post, "/api/v1/trades", TestTokens.For("JSMITH"), Payloads.Ticket(("quantity", 1_000_000), ("price", 100)));

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        var problem = await response.ReadAsync();
        Assert.Equal("This trade is worth $100,000,000, over the $50,000,000 limit for US names.", problem.Text("detail"));
        Assert.Equal([("quantity", "This trade is over the desk limit. Lower the quantity or price.")], problem.FieldErrors());
        Assert.Empty(await BroadcastsAsync());
    }
}
