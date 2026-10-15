using Blotter.Contracts.Wire;

namespace Blotter.Contracts.Reference;

/// <summary>
/// The tradable universe, the same twelve names as <c>shared/src/reference/instruments.ts</c>.
/// The London names are quoted in GBX because that is what the London Stock Exchange does.
/// </summary>
public static class Instruments
{
    /// <summary>Every bookable instrument, in the order the frontend lists them.</summary>
    public static IReadOnlyList<Instrument> All { get; } =
    [
        new("AAPL", Currency.Usd, "EQUITIES_US", 227.45m),
        new("MSFT", Currency.Usd, "EQUITIES_US", 534.22m),
        new("TSLA", Currency.Usd, "TECH_GROWTH", 341.75m),
        new("NVDA", Currency.Usd, "TECH_GROWTH", 178.9m),
        new("AMZN", Currency.Usd, "EQUITIES_US", 231.6m),
        new("META", Currency.Usd, "TECH_GROWTH", 612.35m),
        new("GOOGL", Currency.Usd, "EQUITIES_US", 201.15m),
        new("JPM", Currency.Usd, "FINANCIALS", 268.4m),
        new("HSBA.L", Currency.Gbx, "EQUITIES_UK", 982m),
        new("BP.L", Currency.Gbx, "EQUITIES_UK", 436m),
        new("VOD.L", Currency.Gbx, "EQUITIES_UK", 78m),
        new("SHEL.L", Currency.Gbx, "EQUITIES_UK", 2814m),
    ];

    private static readonly Dictionary<string, Instrument> BySymbol =
        All.ToDictionary(instrument => instrument.Symbol, StringComparer.Ordinal);

    /// <summary>Finds an instrument by its exact, case-sensitive ticker.</summary>
    /// <param name="symbol">The ticker. Null never matches.</param>
    /// <returns>The instrument, or null when the symbol is outside the universe.</returns>
    public static Instrument? Find(string? symbol) =>
        symbol is not null && BySymbol.TryGetValue(symbol, out var instrument) ? instrument : null;
}
