using Blotter.Contracts.Wire;

namespace Blotter.Trades.Simulation;

/// <summary>Something the simulated desk can do on a tick.</summary>
internal enum FeedAction
{
    /// <summary>Book a new trade.</summary>
    Create,

    /// <summary>Amend an active trade.</summary>
    Amend,

    /// <summary>Cancel an active trade.</summary>
    Cancel,
}

/// <summary>
/// The decisions that make the simulated desk behave like one that manages its risk, ported from
/// <c>backend/src/lib/live_feed/</c>: a book held near its cap, amendments that land where a trader is
/// looking, and sides that lean against the position instead of wandering.
/// </summary>
internal static class FeedRules
{
    /// <summary>How many of the newest active trades count as the first screen of the blotter.</summary>
    public const int RecentAmendWindow = 30;

    /// <summary>Share of amendments aimed at the first screen; the rest pick from the whole book.</summary>
    public const double RecentAmendShare = 0.5;

    /// <summary>Net shares at which the lean reaches about three quarters of its strength.</summary>
    public const double LeanScaleShares = 100_000;

    /// <summary>Share of the cap at which bookings start turning into cancels.</summary>
    private const double BandStart = 0.9;

    /// <summary>The highest chance a booking becomes a cancel. Below one, so a full book still books.</summary>
    private const double MaxConversion = 6.0 / 7.0;

    /// <summary>The furthest the chance of a side moves from even. Below 0.5, so no side is ever ruled out.</summary>
    private const double MaxLean = 0.4;

    /// <summary>
    /// The chance a booking becomes a cancel: zero until the book reaches ninety per cent of its cap,
    /// rising in a straight line to six in seven at the cap, and staying there above it.
    /// </summary>
    /// <param name="active">Active trades now.</param>
    /// <param name="cap">The size the desk keeps its book near.</param>
    /// <returns>A probability from 0 to 6/7.</returns>
    public static double ConversionChance(int active, int cap)
    {
        var start = cap * BandStart;

        if (active <= start)
        {
            return 0;
        }

        return active >= cap ? MaxConversion : MaxConversion * (active - start) / (cap - start);
    }

    /// <summary>Decides what the desk does this tick, turning some bookings into cancels near the cap.</summary>
    /// <param name="drawn">The action drawn from the desk's usual 70/20/10 mix.</param>
    /// <param name="active">Active trades now. Only matters for a booking.</param>
    /// <param name="cap">The size the desk keeps its book near.</param>
    /// <param name="roll">A uniform draw in [0, 1).</param>
    /// <returns>The drawn action, except a booking the roll turns into a cancel.</returns>
    public static FeedAction ChooseAction(FeedAction drawn, int active, int cap, double roll) =>
        drawn == FeedAction.Create && roll < ConversionChance(active, cap) ? FeedAction.Cancel : drawn;

    /// <summary>Whether an amendment looks among the newest trades rather than the whole book.</summary>
    /// <param name="roll">A uniform draw in [0, 1).</param>
    /// <returns>True for the first screen.</returns>
    public static bool AmendsRecent(double roll) => roll < RecentAmendShare;

    /// <summary>
    /// Picks a new ticket's side, leaning against the desk's position in that symbol so the book stays
    /// near flat. The chance of a sell is 0.5 + 0.4 tanh(net / 100,000), so it never reaches 0 or 1.
    /// </summary>
    /// <param name="netQuantity">Net shares in the symbol: positive when long.</param>
    /// <param name="roll">A uniform draw in [0, 1).</param>
    /// <returns>SELL when the roll falls under the chance of a sell, otherwise BUY.</returns>
    public static TradeSide LeanSide(long netQuantity, double roll) =>
        roll < 0.5 + (MaxLean * Math.Tanh(netQuantity / LeanScaleShares)) ? TradeSide.Sell : TradeSide.Buy;
}
