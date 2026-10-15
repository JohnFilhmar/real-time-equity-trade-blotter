using Blotter.Contracts.Wire;

namespace Blotter.Trades.Data;

/// <summary>
/// A row of the append-only <c>trade_event</c> table, written in the same transaction as the change
/// it records. The database refuses any update or delete of it.
/// </summary>
internal sealed class TradeEventRow
{
    /// <summary>Row uuid.</summary>
    public Guid Id { get; set; }

    /// <summary>The trade's row uuid.</summary>
    public Guid TradeUuid { get; set; }

    /// <summary>The trade this event belongs to, for reading its business id.</summary>
    public TradeRow? Trade { get; set; }

    /// <summary>The trade's version after the change.</summary>
    public int Version { get; set; }

    /// <summary>Amended or cancelled.</summary>
    public TradeEventAction Action { get; set; }

    /// <summary>The API or the simulated desk.</summary>
    public TradeEventSource Source { get; set; }

    /// <summary>The change set as JSON, <c>{"field":{"from":...,"to":...}}</c>, checked by <c>ISJSON</c>.</summary>
    public string Changes { get; set; } = "{}";

    /// <summary>Desk code of whoever made the change.</summary>
    public string Actor { get; set; } = string.Empty;

    /// <summary>When the change committed.</summary>
    public DateTimeOffset OccurredAt { get; set; }
}
