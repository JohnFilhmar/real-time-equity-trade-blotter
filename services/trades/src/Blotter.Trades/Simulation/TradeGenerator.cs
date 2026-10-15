using Blotter.Contracts.Reference;
using Blotter.Contracts.Wire;
using Blotter.Trades.Domain;

namespace Blotter.Trades.Simulation;

/// <summary>A generated seed trade and the status it is stored with.</summary>
/// <param name="Trade">The trade.</param>
/// <param name="Status">ACTIVE, or CANCELLED for about one in twenty.</param>
internal sealed record SeedTrade(NewTrade Trade, TradeStatus Status);

/// <summary>
/// Generates realistic trades, ported from <c>backend/src/lib/seed/generate_trades.ts</c>: prices drift
/// around each instrument's level in its own currency and are quoted to two decimal places, quantities
/// are round lots skewed small, and trades cluster at the open and the close of weekday sessions.
/// Prices are built from whole basis points, so no float ever touches a price.
/// </summary>
internal static class TradeGenerator
{
    /// <summary>The seed the startup dataset uses, so a reviewer sees the same blotter twice.</summary>
    public const int DefaultSeed = 20_260_818;

    /// <summary>Desk codes in the brief's initial-plus-surname form. Desk codes, not accounts.</summary>
    public static readonly IReadOnlyList<string> Traders =
        ["JSMITH", "ABROWN", "MJONES", "RPATEL", "KOSULLIVAN", "DWRIGHT", "LCHEN", "FMORENO"];

    /// <summary>Counterparties a broker would face, the same list the trade ticket suggests.</summary>
    public static readonly IReadOnlyList<string> Counterparties =
    [
        "Goldman Sachs", "JP Morgan", "Morgan Stanley", "Barclays", "Citigroup",
        "UBS", "Deutsche Bank", "BNP Paribas", "Nomura", "Jefferies",
    ];

    /// <summary>Lists the weekday sessions before a day, at midnight UTC, earliest first. The day itself is never included.</summary>
    /// <param name="day">Any instant on the day to count back from.</param>
    /// <param name="count">How many sessions.</param>
    /// <returns>The sessions.</returns>
    public static IReadOnlyList<DateTimeOffset> SessionsBefore(DateTimeOffset day, int count)
    {
        var sessions = new List<DateTimeOffset>(count);
        var cursor = new DateTimeOffset(day.UtcDateTime.Date, TimeSpan.Zero);

        while (sessions.Count < count)
        {
            cursor = cursor.AddDays(-1);
            if (cursor.DayOfWeek is not (DayOfWeek.Saturday or DayOfWeek.Sunday))
            {
                sessions.Insert(0, cursor);
            }
        }

        return sessions;
    }

    /// <summary>Generates the startup dataset: deterministic for a seed and a run date, oldest first.</summary>
    /// <param name="count">How many trades.</param>
    /// <param name="seed">The random seed.</param>
    /// <param name="today">The day the seed runs. Trades land in the five sessions before it.</param>
    /// <returns>The trades, ordered by execution time.</returns>
    public static IReadOnlyList<SeedTrade> Generate(int count, int seed, DateTimeOffset today)
    {
        var random = new Random(seed);
        var sessions = SessionsBefore(today, 5);

        var trades = Enumerable.Range(0, count).Select(_ =>
        {
            var instrument = Pick(random, Instruments.All);
            var session = Pick(random, sessions);
            var trade = new NewTrade(
                instrument.Symbol,
                random.Next(2) == 0 ? TradeSide.Buy : TradeSide.Sell,
                PickQuantity(random),
                Drift(random, instrument.BasePrice, 400),
                instrument.Currency,
                Pick(random, Traders),
                instrument.Book,
                Pick(random, Counterparties),
                PickSessionTime(random, session));
            return new SeedTrade(trade, random.NextDouble() < 0.05 ? TradeStatus.Cancelled : TradeStatus.Active);
        });

        return [.. trades.OrderBy(seedTrade => seedTrade.Trade.TradeTimestamp)];
    }

    /// <summary>Generates one ticket, timestamped now, on the instrument and side the desk chose.</summary>
    /// <param name="random">The desk's random source.</param>
    /// <param name="instrument">What to trade.</param>
    /// <param name="side">The side, already leaned against the position.</param>
    /// <param name="now">The execution time.</param>
    /// <returns>The ticket and the desk code to book it under.</returns>
    public static (TradeTicket Ticket, string Trader) LiveTrade(Random random, Instrument instrument, TradeSide side, DateTimeOffset now)
    {
        var ticket = new TradeTicket(
            instrument.Symbol,
            side,
            PickQuantity(random),
            Drift(random, instrument.BasePrice, 400),
            instrument.Book,
            Pick(random, Counterparties),
            now);
        return (ticket, Pick(random, Traders));
    }

    /// <summary>Generates an amendment: a new quantity and a price within one per cent of the current one.</summary>
    /// <param name="random">The desk's random source.</param>
    /// <param name="currentPrice">The trade's price now, so the new one drifts rather than jumps.</param>
    /// <returns>Changes to quantity and price only.</returns>
    public static TradeChanges LiveAmendment(Random random, decimal currentPrice) =>
        new(PickQuantity(random), Drift(random, currentPrice, 100), null);

    /// <summary>Moves a price by a whole number of basis points, up to the bound either way, quoted to two decimals.</summary>
    private static decimal Drift(Random random, decimal price, int maxBasisPoints)
    {
        var drift = random.Next(-maxBasisPoints, maxBasisPoints + 1) / 10_000m;
        return Math.Max(0.01m, decimal.Round(price * (1 + drift), 2, MidpointRounding.AwayFromZero));
    }

    /// <summary>A round lot, skewed toward smaller tickets: 60% of 1-20 lots, 30% of 21-100, 10% of 101-500.</summary>
    private static int PickQuantity(Random random)
    {
        var band = random.NextDouble();
        var lots = band < 0.6 ? random.Next(1, 21) : band < 0.9 ? random.Next(21, 101) : random.Next(101, 501);
        return lots * 100;
    }

    /// <summary>A time in the session between 08:00 and 16:30 UTC, clustered at the open and the close.</summary>
    private static DateTimeOffset PickSessionTime(Random random, DateTimeOffset sessionDay)
    {
        var roll = random.NextDouble();
        var minutes = roll < 0.35 ? random.Next(0, 46) : roll < 0.65 ? random.Next(465, 511) : random.Next(46, 465);
        return sessionDay.AddHours(8).AddMinutes(minutes).AddSeconds(random.Next(0, 60));
    }

    private static T Pick<T>(Random random, IReadOnlyList<T> items) => items[random.Next(items.Count)];
}
