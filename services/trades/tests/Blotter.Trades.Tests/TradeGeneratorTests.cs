using Blotter.Contracts.Reference;
using Blotter.Contracts.Wire;
using Blotter.Trades.Simulation;
using Xunit;

namespace Blotter.Trades.Tests;

/// <summary>Ported from <c>backend/src/lib/seed/generate_trades.test.ts</c>.</summary>
public sealed class TradeGeneratorTests
{
    private static readonly DateTimeOffset Wednesday = new(2026, 9, 16, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public void Is_deterministic_for_a_seed_and_run_date_and_differs_for_another_seed()
    {
        var first = TradeGenerator.Generate(50, 7, Wednesday);
        var again = TradeGenerator.Generate(50, 7, Wednesday);
        var other = TradeGenerator.Generate(50, 8, Wednesday);

        Assert.Equal(first, again);
        Assert.NotEqual(first, other);
    }

    [Fact]
    public void Generates_the_requested_count_oldest_first()
    {
        var trades = TradeGenerator.Generate(200, TradeGenerator.DefaultSeed, Wednesday);

        Assert.Equal(200, trades.Count);
        Assert.Equal(trades.OrderBy(seed => seed.Trade.TradeTimestamp).ToList(), trades);
    }

    [Fact]
    public void Dates_every_trade_inside_a_session_in_the_five_weekdays_before_the_run()
    {
        var sessions = TradeGenerator.SessionsBefore(Wednesday, 5).Select(session => session.UtcDateTime.Date).ToHashSet();

        foreach (var seed in TradeGenerator.Generate(300, TradeGenerator.DefaultSeed, Wednesday))
        {
            var at = seed.Trade.TradeTimestamp.UtcDateTime;
            Assert.Contains(at.Date, sessions);
            Assert.InRange(at.TimeOfDay, TimeSpan.FromHours(8), new TimeSpan(16, 30, 59));
        }
    }

    [Fact]
    public void Quotes_prices_near_each_instrument_to_two_decimals_in_round_lots()
    {
        foreach (var seed in TradeGenerator.Generate(300, TradeGenerator.DefaultSeed, Wednesday))
        {
            var basePrice = Instruments.Find(seed.Trade.Symbol)!.BasePrice;
            Assert.InRange(seed.Trade.Price, basePrice * 0.95m, basePrice * 1.05m);
            Assert.Equal(seed.Trade.Price, decimal.Round(seed.Trade.Price, 2));
            Assert.Equal(0, seed.Trade.Quantity % 100);
            Assert.Contains(seed.Trade.Counterparty, TradeGenerator.Counterparties);
            Assert.Equal(Instruments.Find(seed.Trade.Symbol)!.Currency, seed.Trade.Currency);
        }
    }

    [Fact]
    public void Cancels_a_minority_so_the_status_filter_has_something_to_find()
    {
        var cancelled = TradeGenerator.Generate(1000, TradeGenerator.DefaultSeed, Wednesday).Count(seed => seed.Status == TradeStatus.Cancelled);

        Assert.InRange(cancelled, 20, 100);
    }

    [Fact]
    public void Counts_sessions_back_over_the_weekend_at_midnight_utc()
    {
        var monday = new DateTimeOffset(2026, 9, 14, 9, 0, 0, TimeSpan.Zero);

        Assert.Equal(
            new[] { "2026-09-10", "2026-09-11" },
            TradeGenerator.SessionsBefore(monday, 2).Select(day => day.ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture)));
        Assert.All(TradeGenerator.SessionsBefore(Wednesday, 5), day => Assert.Equal(TimeSpan.Zero, day.TimeOfDay));
        Assert.DoesNotContain(TradeGenerator.SessionsBefore(Wednesday, 5), day => day.Date == Wednesday.Date);
    }

    [Fact]
    public void Live_tickets_and_amendments_book_what_they_are_given_at_two_decimals()
    {
        var random = new Random(1);
        var instrument = Instruments.Find("VOD.L")!;

        for (var draw = 0; draw < 50; draw++)
        {
            var (ticket, trader) = TradeGenerator.LiveTrade(random, instrument, TradeSide.Sell, Wednesday);
            Assert.Equal("VOD.L", ticket.Symbol);
            Assert.Equal(TradeSide.Sell, ticket.Side);
            Assert.Equal(ticket.Price, decimal.Round(ticket.Price, 2));
            Assert.Contains(trader, TradeGenerator.Traders);

            var amendment = TradeGenerator.LiveAmendment(random, 78.123456m);
            Assert.NotNull(amendment.Quantity);
            Assert.Equal(amendment.Price, decimal.Round(amendment.Price!.Value, 2));
            Assert.Null(amendment.Book);
        }
    }
}
