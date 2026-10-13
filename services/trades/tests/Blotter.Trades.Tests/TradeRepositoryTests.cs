using Blotter.Contracts.Wire;
using Blotter.Trades.Domain;
using Blotter.Trades.Tests.Fixtures;
using Microsoft.Extensions.Time.Testing;
using Xunit;

namespace Blotter.Trades.Tests;

/// <summary>
/// Ported from <c>prisma_trade_repository.integration.test.ts</c>: concurrency under real
/// transactions, the global event feed, and the active-book reads positions and the desk rely on.
/// </summary>
public sealed class TradeRepositoryTests(SqlServerFixture server) : TradesDatabase(server)
{
    [Fact]
    public async Task Two_amendments_at_the_same_version_race_and_exactly_one_wins()
    {
        var created = await Service.CreateAsync(ATicket(), Trader, default);

        var outcomes = await Task.WhenAll(Enumerable.Range(0, 6).Select(async index =>
        {
            try
            {
                await Service.AmendAsync(created.TradeId, 1, new TradeChanges(100 * (index + 1), null, null), Trader, default);
                return "won";
            }
            catch (TradeRuleViolation violation) when (violation.Kind == TradeRuleKind.Conflict)
            {
                return "conflict";
            }
        }));

        Assert.Equal(1, outcomes.Count(outcome => outcome == "won"));
        Assert.Equal(2, (await Service.GetAsync(created.TradeId, default)).Version);
        Assert.Single(await Service.ListHistoryAsync(created.TradeId, default));
    }

    [Fact]
    public async Task Concurrent_cancels_cancel_once_and_only_once()
    {
        var created = await Service.CreateAsync(ATicket(), Trader, default);

        var outcomes = await Task.WhenAll(Enumerable.Range(0, 4).Select(async _ =>
        {
            try
            {
                await Service.CancelAsync(created.TradeId, null, Trader, default);
                return true;
            }
            catch (TradeRuleViolation violation) when (violation.Kind == TradeRuleKind.Conflict)
            {
                return false;
            }
        }));

        Assert.Equal(1, outcomes.Count(won => won));
        Assert.Single(await Service.ListHistoryAsync(created.TradeId, default));
    }

    [Fact]
    public async Task The_global_feed_lists_newest_first_and_walks_its_cursor_one_event_at_a_time()
    {
        var clock = new FakeTimeProvider(new DateTimeOffset(2026, 10, 12, 9, 0, 0, TimeSpan.Zero));
        Clock = clock;
        var created = await Service.CreateAsync(ATicket(), Trader, default);
        clock.Advance(TimeSpan.FromSeconds(1));
        await Service.AmendAsync(created.TradeId, 1, new TradeChanges(7500, null, null), Trader, default);
        clock.Advance(TimeSpan.FromSeconds(1));
        await Service.CancelAsync(created.TradeId, 2, Trader, default);

        var walked = new List<TradeEvent>();
        Guid? cursor = null;
        for (var page = 0; page < 5; page++)
        {
            var result = await Service.ListEventsAsync(1, cursor, default);
            Assert.Equal(2, result.Total);
            walked.AddRange(result.Data);
            if (result.NextCursor is null)
            {
                break;
            }

            cursor = PageCursor.Decode(result.NextCursor);
        }

        Assert.Equal(new[] { TradeEventAction.Cancelled, TradeEventAction.Amended }, walked.Select(entry => entry.Action));
        Assert.Equal(new[] { 3, 2 }, walked.Select(entry => entry.Version));
        Assert.All(walked, entry => Assert.Equal(created.TradeId, entry.TradeId));
    }

    [Fact]
    public async Task Active_trades_come_in_execution_order_without_cancelled_ones()
    {
        var later = await Service.CreateAsync(ATicket(symbol: "GOOGL", tradeTimestamp: "2026-08-18T11:00:00.000Z"), Trader, default);
        var earlier = await Service.CreateAsync(ATicket(symbol: "GOOGL", tradeTimestamp: "2026-08-18T10:00:00.000Z"), Trader, default);
        var doomed = await Service.CreateAsync(ATicket(symbol: "GOOGL", tradeTimestamp: "2026-08-18T10:30:00.000Z"), Trader, default);
        await Service.CreateAsync(ATicket(symbol: "JPM"), Trader, default);
        await Service.CancelAsync(doomed.TradeId, null, Trader, default);

        var googl = await Repository.FindActiveTradesAsync("GOOGL", default);
        var all = await Repository.FindActiveTradesAsync(null, default);

        Assert.Equal(new[] { earlier.TradeId, later.TradeId }, googl.Select(trade => trade.TradeId));
        Assert.Equal(3, all.Count);
        Assert.All(all, trade => Assert.Equal(TradeStatus.Active, trade.Status));
        Assert.Equal(all.OrderBy(trade => trade.TradeTimestamp).Select(trade => trade.TradeId), all.Select(trade => trade.TradeId));
    }

    [Fact]
    public async Task Counts_only_active_trades_and_reads_the_newest_by_execution_time()
    {
        var newest = await Service.CreateAsync(ATicket(tradeTimestamp: "2026-08-18T12:00:02.000Z"), Trader, default);
        var second = await Service.CreateAsync(ATicket(tradeTimestamp: "2026-08-18T12:00:01.000Z"), Trader, default);
        await Service.CreateAsync(ATicket(tradeTimestamp: "2026-08-18T11:00:00.000Z"), Trader, default);
        var dropped = await Service.CreateAsync(ATicket(tradeTimestamp: "2026-08-18T12:00:03.000Z"), Trader, default);
        await Service.CancelAsync(dropped.TradeId, null, Trader, default);

        Assert.Equal(3, await Repository.CountActiveAsync(default));
        Assert.Equal(new[] { newest.TradeId, second.TradeId }, (await Repository.FindNewestActiveAsync(2, default)).Select(trade => trade.TradeId));
        Assert.Empty(await Repository.FindNewestActiveAsync(0, default));
        Assert.NotNull(await Repository.FindActiveByAgeAsync(2, default));
        Assert.Null(await Repository.FindActiveByAgeAsync(3, default));
    }

    [Fact]
    public async Task Business_ids_come_from_the_sequence_in_order_and_never_truncate()
    {
        var first = await Service.CreateAsync(ATicket(), Trader, default);
        var second = await Service.CreateAsync(ATicket(), Trader, default);

        Assert.Equal("TRD-100001", first.TradeId);
        Assert.Equal("TRD-100002", second.TradeId);
        Assert.Equal("TRD-1000000", Repositories.TradeRepository.FormatTradeId(1_000_000));
    }
}
