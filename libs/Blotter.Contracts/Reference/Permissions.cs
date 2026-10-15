namespace Blotter.Contracts.Reference;

/// <summary>
/// Every permission the services check, named for the decision rather than the role. The
/// <c>.any</c> pair is what separates an administrator from a trader: a trader may amend and cancel
/// their own trades, an administrator anyone's.
/// </summary>
public static class Permissions
{
    /// <summary>Read trades, events, positions and the live stream.</summary>
    public const string TradeRead = "trade.read";

    /// <summary>Book a new trade.</summary>
    public const string TradeCreate = "trade.create";

    /// <summary>Amend a trade booked under your own desk code.</summary>
    public const string TradeAmend = "trade.amend";

    /// <summary>Amend anyone's trade.</summary>
    public const string TradeAmendAny = "trade.amend.any";

    /// <summary>Cancel a trade booked under your own desk code.</summary>
    public const string TradeCancel = "trade.cancel";

    /// <summary>Cancel anyone's trade.</summary>
    public const string TradeCancelAny = "trade.cancel.any";

    /// <summary>Every permission, in the order of <c>permission_values</c> in the shared package.</summary>
    public static IReadOnlyList<string> All { get; } =
        [TradeRead, TradeCreate, TradeAmend, TradeAmendAny, TradeCancel, TradeCancelAny];
}
