using Blotter.Contracts.Reference;

namespace Blotter.Realtime.Marks;

/// <summary>
/// The simulated market, from <c>backend/src/lib/marks/</c>: every symbol starts at its reference
/// price and walks by at most 0.11% a tick, or 0.18% below 20, so a cheap name visibly moves without a
/// dear one jumping. Marks are exact decimals, quoted to the cent and never below 0.01.
/// </summary>
internal static class MarkBook
{
    private const decimal LowPriceThreshold = 20m;

    /// <summary>Drift bound in millionths: 1,100 is 0.11%.</summary>
    private const int DriftAtOrAbove = 1_100;

    /// <summary>Drift bound in millionths below the threshold: 1,800 is 0.18%.</summary>
    private const int DriftBelow = 1_800;

    private const decimal Floor = 0.01m;

    /// <summary>One mark per instrument at its reference price, in universe order.</summary>
    /// <returns>The starting marks.</returns>
    public static Dictionary<string, decimal> Initial() =>
        Instruments.All.ToDictionary(instrument => instrument.Symbol, instrument => instrument.BasePrice, StringComparer.Ordinal);

    /// <summary>
    /// Walks one mark by a random step inside its bound, then rounds to the cent and floors, in that
    /// order, so rounding cannot produce zero.
    /// </summary>
    /// <param name="mark">The current mark.</param>
    /// <param name="random">The random source.</param>
    /// <returns>The next mark.</returns>
    public static decimal Step(decimal mark, Random random)
    {
        ArgumentNullException.ThrowIfNull(random);

        var bound = mark >= LowPriceThreshold ? DriftAtOrAbove : DriftBelow;
        var drift = random.Next(-bound, bound + 1) / 1_000_000m;
        return Math.Max(Floor, decimal.Round(mark * (1 + drift), 2, MidpointRounding.AwayFromZero));
    }
}
