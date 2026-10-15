using System.Net;
using Blotter.Gateway.Tests.Fixtures;
using Xunit;

namespace Blotter.Gateway.Tests;

/// <summary>Cancelling a trade, ported from <c>POST /api/v1/trades/:trade_id/cancel</c> in the Node route tests. A fresh system per test.</summary>
/// <param name="sql">The shared SQL Server.</param>
/// <param name="redis">The shared Redis.</param>
public sealed class TradeCancelTests(SqlServerFixture sql, RedisFixture redis) : GatewayEnvironment(sql, redis)
{
    private const string CancelPath = "/api/v1/trades/TRD-100001/cancel";

    private static readonly string Jsmith = TestTokens.For("JSMITH");

    [Fact]
    public async Task It_cancels_the_trade_and_announces_it()
    {
        await BookAsync(Jsmith);

        using var response = await SendAsync(HttpMethod.Post, CancelPath, Jsmith, "{}");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("CANCELLED", (await response.ReadAsync()).Text("status"));
        Assert.Equal(
            ["trade.created", "position.updated", "trade.cancelled", "trade_event.recorded", "position.updated"],
            await BroadcastsAsync());
    }

    [Fact]
    public async Task It_answers_409_on_a_second_cancel()
    {
        await BookAsync(Jsmith);
        using var first = await SendAsync(HttpMethod.Post, CancelPath, Jsmith, "{}");

        using var response = await SendAsync(HttpMethod.Post, CancelPath, Jsmith, "{}");

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var problem = await response.ReadAsync();
        Assert.Equal("conflict", problem.Text("code"));
        Assert.Equal("Trade TRD-100001 is cancelled and can no longer be cancelled", problem.Text("detail"));
    }

    [Fact]
    public async Task It_answers_404_for_a_trade_that_does_not_exist()
    {
        using var response = await SendAsync(HttpMethod.Post, "/api/v1/trades/TRD-999999/cancel", Jsmith, "{}");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        var problem = await response.ReadAsync();
        Assert.Equal("not_found", problem.Text("code"));
        Assert.Equal("trade TRD-999999 was not found", problem.Text("detail"));
    }

    [Fact]
    public async Task It_cancels_when_no_body_is_sent_at_all()
    {
        await BookAsync(Jsmith);

        using var response = await SendAsync(HttpMethod.Post, CancelPath, Jsmith);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("CANCELLED", (await response.ReadAsync()).Text("status"));
    }
}
