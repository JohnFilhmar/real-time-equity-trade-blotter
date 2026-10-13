using System.Text.Json.Serialization;

namespace Blotter.Contracts.Wire;

/// <summary>
/// One entry in a trade's audit trail, matching <c>trade_event_schema</c> in
/// <c>shared/src/schemas/trade_event.ts</c>. Addressed by the business trade id, never the row
/// uuid, so a client holds one identifier per trade.
/// </summary>
/// <param name="Id">Event row uuid.</param>
/// <param name="TradeId">Business identifier of the trade it belongs to.</param>
/// <param name="Version">The trade's version after this change.</param>
/// <param name="Action">Amended or cancelled.</param>
/// <param name="Source">The API or the simulated desk.</param>
/// <param name="Changes">Every field that moved, keyed by its wire name, such as <c>price</c>.</param>
/// <param name="Actor">Desk code of whoever made the change.</param>
/// <param name="OccurredAt">When the change committed, to the millisecond.</param>
public sealed record TradeEvent(
    [property: JsonPropertyName("id")] Guid Id,
    [property: JsonPropertyName("tradeId")] string TradeId,
    [property: JsonPropertyName("version")] int Version,
    [property: JsonPropertyName("action")] TradeEventAction Action,
    [property: JsonPropertyName("source")] TradeEventSource Source,
    [property: JsonPropertyName("changes")] IReadOnlyDictionary<string, FieldChange> Changes,
    [property: JsonPropertyName("actor")] string Actor,
    [property: JsonPropertyName("occurredAt")] DateTimeOffset OccurredAt);
