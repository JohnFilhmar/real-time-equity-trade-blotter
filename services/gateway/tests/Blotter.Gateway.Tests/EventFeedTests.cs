using System.Net;
using System.Text.Json;
using Blotter.Contracts.Wire;
using Blotter.Gateway.Tests.Fixtures;
using Microsoft.Extensions.Time.Testing;
using Xunit;

namespace Blotter.Gateway.Tests;

/// <summary>
/// The desk-wide event feed, ported from <c>GET /api/v1/trades/events</c> in the Node route tests.
/// A fresh system per test, with the trades service on a clock the test moves a second between
/// changes, as the Node tests' make_history did, so newest-first is never decided by a tie.
/// </summary>
/// <param name="sql">The shared SQL Server.</param>
/// <param name="redis">The shared Redis.</param>
public sealed class EventFeedTests(SqlServerFixture sql, RedisFixture redis) : GatewayEnvironment(sql, redis)
{
    private const string FeedPath = "/api/v1/trades/events";

    private static readonly string Jsmith = TestTokens.For("JSMITH");

    private readonly FakeTimeProvider clock = new(DateTimeOffset.UtcNow);

    /// <inheritdoc />
    protected override TimeProvider? TradesClock => clock;

    [Fact]
    public async Task It_refuses_the_request_without_a_token()
    {
        using var response = await SendAsync(HttpMethod.Get, FeedPath);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("unauthenticated", (await response.ReadAsync()).Text("code"));
    }

    [Fact]
    public async Task A_viewer_may_read_it_and_the_envelope_satisfies_the_shared_contract()
    {
        await MakeHistoryAsync();

        using var response = await SendAsync(HttpMethod.Get, FeedPath, TestTokens.For("VIEWER", Role.Viewer));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var page = await response.ReadAsync();
        Assert.Equal(3, page.GetProperty("total").GetInt32());
        Assert.Equal(100, page.GetProperty("limit").GetInt32());
        Assert.Equal(JsonValueKind.Null, page.GetProperty("next_cursor").ValueKind);
        Assert.All(page.GetProperty("data").EnumerateArray(), recorded => Assert.Equal("TRD-100001", recorded.Text("tradeId")));
    }

    [Fact]
    public async Task It_lists_the_newest_event_first()
    {
        await MakeHistoryAsync();

        using var response = await SendAsync(HttpMethod.Get, FeedPath, Jsmith);

        var data = (await response.ReadAsync()).GetProperty("data");
        Assert.Equal([4, 3, 2], data.EnumerateArray().Select(recorded => recorded.GetProperty("version").GetInt32()));
        Assert.Equal("CANCELLED", data[0].Text("action"));
    }

    [Fact]
    public async Task It_respects_the_limit()
    {
        await MakeHistoryAsync();

        using var response = await SendAsync(HttpMethod.Get, $"{FeedPath}?limit=2", Jsmith);

        var page = await response.ReadAsync();
        Assert.Equal(2, page.GetProperty("data").GetArrayLength());
        Assert.Equal(2, page.GetProperty("limit").GetInt32());
        Assert.Equal(3, page.GetProperty("total").GetInt32());
        Assert.Equal(JsonValueKind.String, page.GetProperty("next_cursor").ValueKind);
    }

    [Fact]
    public async Task It_hands_back_a_cursor_that_fetches_the_rest_without_overlap_and_then_ends()
    {
        await MakeHistoryAsync();

        using var first = await SendAsync(HttpMethod.Get, $"{FeedPath}?limit=2", Jsmith);
        var firstPage = await first.ReadAsync();
        using var second = await SendAsync(HttpMethod.Get, $"{FeedPath}?limit=2&cursor={firstPage.Text("next_cursor")}", Jsmith);
        var secondPage = await second.ReadAsync();

        var firstIds = firstPage.GetProperty("data").EnumerateArray().Select(recorded => recorded.Text("id")).ToList();
        var remaining = Assert.Single(secondPage.GetProperty("data").EnumerateArray());
        Assert.DoesNotContain(remaining.Text("id"), firstIds);
        Assert.Equal(2, remaining.GetProperty("version").GetInt32());
        Assert.Equal(JsonValueKind.Null, secondPage.GetProperty("next_cursor").ValueKind);
    }

    /// <summary>Books TRD-100001, amends it twice and cancels it, a second apart: events at versions 2, 3 and 4.</summary>
    private async Task MakeHistoryAsync()
    {
        await BookAsync(Jsmith);
        using var first = await SendAsync(HttpMethod.Patch, "/api/v1/trades/TRD-100001", Jsmith, "{\"version\":1,\"quantity\":100}");
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);

        clock.Advance(TimeSpan.FromSeconds(1));
        using var second = await SendAsync(HttpMethod.Patch, "/api/v1/trades/TRD-100001", Jsmith, "{\"version\":2,\"quantity\":200}");
        Assert.Equal(HttpStatusCode.OK, second.StatusCode);

        clock.Advance(TimeSpan.FromSeconds(1));
        using var cancel = await SendAsync(HttpMethod.Post, "/api/v1/trades/TRD-100001/cancel", Jsmith, "{}");
        Assert.Equal(HttpStatusCode.OK, cancel.StatusCode);
    }
}
