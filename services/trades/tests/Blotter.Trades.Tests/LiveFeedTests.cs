using Blotter.Contracts.Reference;
using Blotter.Contracts.Wire;
using Blotter.Trades.Domain;
using Blotter.Trades.Settings;
using Blotter.Trades.Simulation;
using Blotter.Trades.Tests.Fixtures;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Time.Testing;
using Xunit;

namespace Blotter.Trades.Tests;

/// <summary>
/// Ported from <c>backend/src/lib/live_feed/live_feed.test.ts</c>. The desk is driven tick by tick
/// against a real database, with a seeded random source, so every run takes the same path.
/// </summary>
public sealed class LiveFeedTests(SqlServerFixture server) : TradesDatabase(server)
{
    [Fact]
    public async Task Books_a_trade_first_because_the_blotter_starts_empty()
    {
        using var services = BuildServices();
        var feed = Feed(services, cap: 10_000);

        await feed.TickAsync(default);

        var trade = Assert.Single(await Repository.FindActiveTradesAsync(null, default));
        Assert.Contains(trade.Trader, TradeGenerator.Traders);
    }

    [Fact]
    public async Task Amends_and_cancels_existing_trades_through_the_same_rules_as_a_person()
    {
        using var services = BuildServices();
        var feed = Feed(services, cap: 10_000);

        for (var tick = 0; tick < 120; tick++)
        {
            await feed.TickAsync(default);
        }

        var events = (await Service.ListEventsAsync(500, null, default)).Data;
        Assert.Contains(events, entry => entry.Action == TradeEventAction.Amended);
        Assert.Contains(events, entry => entry.Action == TradeEventAction.Cancelled);
        Assert.All(events, entry => Assert.Equal(TradeEventSource.LiveFeed, entry.Source));
        Assert.True(await Repository.CountActiveAsync(default) > 0);
    }

    [Fact]
    public async Task Holds_a_growing_book_close_to_its_cap()
    {
        using var services = BuildServices();
        var feed = Feed(services, cap: 12);
        var largest = 0;

        for (var tick = 0; tick < 250; tick++)
        {
            await feed.TickAsync(default);
            largest = Math.Max(largest, await Repository.CountActiveAsync(default));
        }

        Assert.InRange(largest, 10, 18);
    }

    [Fact]
    public async Task Keeps_booking_while_over_the_cap_and_works_the_book_back_toward_it()
    {
        await FillAsync(perSymbol: 5, TradeSide.Buy, quantity: 100);
        using var services = BuildServices();
        var feed = Feed(services, cap: 12);
        var bookedOverCap = false;

        for (var tick = 0; tick < 150; tick++)
        {
            var activeBefore = await Repository.CountActiveAsync(default);
            var tradesBefore = (await Service.ListAsync(AllTrades(), default)).Total;
            await feed.TickAsync(default);
            if (activeBefore > 12 && (await Service.ListAsync(AllTrades(), default)).Total > tradesBefore)
            {
                bookedOverCap = true;
            }
        }

        Assert.True(bookedOverCap);
        Assert.True(await Repository.CountActiveAsync(default) < 24);
    }

    [Fact]
    public async Task Sells_into_a_book_that_is_long_rather_than_adding_to_it_at_random()
    {
        var seeded = (await FillAsync(perSymbol: 5, TradeSide.Buy, quantity: 5_000_000)).Select(trade => trade.TradeId).ToHashSet();
        using var services = BuildServices();
        var feed = Feed(services, cap: 10_000);

        for (var tick = 0; tick < 60; tick++)
        {
            await feed.TickAsync(default);
        }

        var booked = (await Repository.FindActiveTradesAsync(null, default))
            .Where(trade => !seeded.Contains(trade.TradeId) && trade.Version == 1)
            .ToList();
        Assert.True(booked.Count > 20, $"only {booked.Count} trades booked");
        Assert.True(booked.Count(trade => trade.Side == TradeSide.Buy) <= booked.Count / 4);
    }

    [Fact]
    public async Task Keeps_running_after_an_unexpected_failure()
    {
        using var services = BuildServices("Server=127.0.0.1,1;Database=nowhere;User Id=sa;Password=x;Connect Timeout=1;TrustServerCertificate=True");
        var logger = new ListLogger<LiveFeed>();
        var feed = Feed(services, cap: 10_000, logger);

        for (var tick = 0; tick < 3; tick++)
        {
            await feed.TickAsync(default);
        }

        Assert.Equal(3, logger.Entries.Count(entry => entry.Level == LogLevel.Warning));
    }

    [Fact]
    public async Task Acts_once_per_interval_only_while_started()
    {
        var clock = new FakeTimeProvider(DateTimeOffset.UtcNow);
        Clock = clock;
        using var services = BuildServices();
        var feed = Feed(services, cap: 10_000);

        clock.Advance(TimeSpan.FromSeconds(5));
        Assert.Equal(0, await Repository.CountActiveAsync(default));

        await feed.StartAsync(default);
        await AdvanceUntilAsync(clock, async () => await TradeCountAsync() >= 2);
        await feed.StopAsync(default);
        var afterStop = await TradeCountAsync();

        clock.Advance(TimeSpan.FromSeconds(10));
        await Task.Delay(200);
        Assert.Equal(afterStop, await TradeCountAsync());
    }

    private static TradeQuery AllTrades() =>
        new(null, null, null, null, null, null, null, null, TradeSortColumn.TradeTimestamp, true, 1, null);

    private static async Task AdvanceUntilAsync(FakeTimeProvider clock, Func<Task<bool>> done)
    {
        for (var attempt = 0; attempt < 100 && !await done(); attempt++)
        {
            clock.Advance(TimeSpan.FromSeconds(1));
            await Task.Delay(50);
        }

        Assert.True(await done(), "the feed never acted");
    }

    private LiveFeed Feed(ServiceProvider services, int cap, ILogger<LiveFeed>? logger = null) => new(
        services.GetRequiredService<IServiceScopeFactory>(),
        new TradesSettings { LiveFeedMinIntervalMs = 1_000, LiveFeedMaxIntervalMs = 1_000, LiveFeedMaxActiveTrades = cap },
        Clock,
        new Random(20_260_915),
        logger ?? new ListLogger<LiveFeed>());

    private async Task<int> TradeCountAsync() => (await Service.ListAsync(AllTrades(), default)).Total;

    private async Task<List<Trade>> FillAsync(int perSymbol, TradeSide side, int quantity)
    {
        var stored = new List<Trade>();
        foreach (var instrument in Instruments.All)
        {
            for (var index = 0; index < perSymbol; index++)
            {
                stored.Add(await Repository.CreateAsync(
                    new NewTrade(instrument.Symbol, side, quantity, 100m, instrument.Currency, "JSMITH", instrument.Book, "UBS", DateTimeOffset.UtcNow),
                    default));
            }
        }

        return stored;
    }
}
