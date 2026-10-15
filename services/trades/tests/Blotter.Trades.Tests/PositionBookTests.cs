using Blotter.Contracts.Wire;
using Blotter.Trades.Domain;
using Xunit;

namespace Blotter.Trades.Tests;

/// <summary>Ported from <c>shared/src/positions/position_book.test.ts</c>, now in exact decimals.</summary>
public sealed class PositionBookTests
{
    private static int counter;

    [Fact]
    public void Opens_a_flat_book_at_the_trade_price()
    {
        var position = PositionBook.Apply(PositionBook.Empty("AAPL", Currency.Usd), ATrade(quantity: 100, price: 100m));

        Assert.Equal(100, position.NetQuantity);
        Assert.Equal(100m, position.AveragePrice);
        Assert.Equal(0m, position.RealisedPnl);
        Assert.Equal(100, position.BuyQuantity);
        Assert.Equal(1, position.TradeCount);
        Assert.Equal(10_000m, position.GrossNotional);
    }

    [Fact]
    public void Moves_the_average_when_adding_on_the_same_side()
    {
        var opened = PositionBook.Apply(PositionBook.Empty("AAPL", Currency.Usd), ATrade(quantity: 100, price: 100m));
        var added = PositionBook.Apply(opened, ATrade(quantity: 100, price: 110m));

        Assert.Equal(200, added.NetQuantity);
        Assert.Equal(105m, added.AveragePrice);
        Assert.Equal(0m, added.RealisedPnl);
    }

    [Fact]
    public void Realises_against_the_average_when_closing_part_of_the_book()
    {
        var opened = PositionBook.Apply(PositionBook.Empty("AAPL", Currency.Usd), ATrade(quantity: 200, price: 100m));
        var closed = PositionBook.Apply(opened, ATrade(side: TradeSide.Sell, quantity: 50, price: 120m));

        Assert.Equal(150, closed.NetQuantity);
        Assert.Equal(100m, closed.AveragePrice);
        Assert.Equal(1_000m, closed.RealisedPnl);
    }

    [Fact]
    public void Flips_long_to_short_and_opens_the_remainder_at_the_trade_price()
    {
        var opened = PositionBook.Apply(PositionBook.Empty("AAPL", Currency.Usd), ATrade(quantity: 100, price: 100m));
        var flipped = PositionBook.Apply(opened, ATrade(side: TradeSide.Sell, quantity: 300, price: 90m));

        Assert.Equal(-200, flipped.NetQuantity);
        Assert.Equal(90m, flipped.AveragePrice);
        Assert.Equal(-1_000m, flipped.RealisedPnl);
    }

    [Fact]
    public void Realises_a_gain_when_a_short_is_covered_below_its_average()
    {
        var shorted = PositionBook.Apply(PositionBook.Empty("AAPL", Currency.Usd), ATrade(side: TradeSide.Sell, quantity: 100, price: 100m));
        var covered = PositionBook.Apply(shorted, ATrade(quantity: 100, price: 95m));

        Assert.Equal(0, covered.NetQuantity);
        Assert.Equal(0m, covered.AveragePrice);
        Assert.Equal(500m, covered.RealisedPnl);
    }

    [Fact]
    public void Does_not_mutate_its_input()
    {
        var before = PositionBook.Empty("AAPL", Currency.Usd);

        PositionBook.Apply(before, ATrade());

        Assert.Equal(0, before.TradeCount);
    }

    [Fact]
    public void Walks_trades_in_execution_order_regardless_of_input_order_ignoring_cancelled_ones()
    {
        var later = ATrade(side: TradeSide.Sell, quantity: 50, price: 120m, at: "2026-08-18T10:00:00.000Z");
        var earlier = ATrade(quantity: 100, price: 100m, at: "2026-08-18T09:00:00.000Z");
        var cancelled = ATrade(quantity: 9_999, price: 1m) with { Status = TradeStatus.Cancelled };

        var position = Assert.Single(PositionBook.Build([later, cancelled, earlier]));

        Assert.Equal(50, position.NetQuantity);
        Assert.Equal(100m, position.AveragePrice);
        Assert.Equal(1_000m, position.RealisedPnl);
        Assert.Equal(2, position.TradeCount);
    }

    [Fact]
    public void Returns_one_position_per_symbol_sorted()
    {
        var positions = PositionBook.Build(
            [ATrade(symbol: "MSFT"), ATrade(symbol: "AAPL"), ATrade(symbol: "HSBA.L", currency: Currency.Gbx)]);

        Assert.Equal(new[] { "AAPL", "HSBA.L", "MSFT" }, positions.Select(position => position.Symbol));
        Assert.Equal(Currency.Gbx, positions[1].Currency);
    }

    [Fact]
    public void Keeps_the_average_exact_where_floats_would_drift()
    {
        var first = PositionBook.Apply(PositionBook.Empty("AAPL", Currency.Usd), ATrade(quantity: 300, price: 0.1m));
        var second = PositionBook.Apply(first, ATrade(quantity: 300, price: 0.2m));

        Assert.Equal(0.15m, second.AveragePrice);
        Assert.Equal(90m, second.GrossNotional);
    }

    private static Trade ATrade(
        string symbol = "AAPL",
        TradeSide side = TradeSide.Buy,
        int quantity = 100,
        decimal price = 100m,
        Currency currency = Currency.Usd,
        string? at = null)
    {
        var index = Interlocked.Increment(ref counter);
        var timestamp = at is null
            ? new DateTimeOffset(2026, 8, 18, 9, index % 60, 0, TimeSpan.Zero)
            : DateTimeOffset.Parse(at, System.Globalization.CultureInfo.InvariantCulture);

        return new Trade(
            Guid.Parse($"00000000-0000-4000-8000-{index:D12}"),
            $"TRD-{100_000 + index}",
            symbol,
            side,
            quantity,
            price,
            currency,
            "JSMITH",
            "EQUITIES_US",
            "Goldman Sachs",
            timestamp,
            TradeStatus.Active,
            1,
            timestamp,
            timestamp);
    }
}
