using Blotter.Contracts.Messages;

namespace Blotter.Realtime.Hubs;

/// <summary>
/// The event names clients listen for, unchanged from <c>trade_events</c> in
/// <c>shared/src/events/socket_events.ts</c>, so the frontend's handlers keep their names.
/// </summary>
internal static class HubEvents
{
    /// <summary>A trade was booked.</summary>
    public const string TradeCreated = "trade.created";

    /// <summary>A trade was amended.</summary>
    public const string TradeAmended = "trade.amended";

    /// <summary>A trade was cancelled.</summary>
    public const string TradeCancelled = "trade.cancelled";

    /// <summary>An audit row was written.</summary>
    public const string TradeEventRecorded = "trade_event.recorded";

    /// <summary>A symbol's position was recomputed.</summary>
    public const string PositionUpdated = "position.updated";

    /// <summary>The whole mark set moved.</summary>
    public const string MarkUpdated = "mark.updated";

    /// <summary>The event name a trade envelope travels under for each kind of change.</summary>
    /// <param name="kind">The change.</param>
    /// <returns>One of the three trade event names.</returns>
    public static string For(TradeChangeKind kind) => kind switch
    {
        TradeChangeKind.Created => TradeCreated,
        TradeChangeKind.Amended => TradeAmended,
        TradeChangeKind.Cancelled => TradeCancelled,
        _ => throw new ArgumentOutOfRangeException(nameof(kind), kind, null),
    };
}
