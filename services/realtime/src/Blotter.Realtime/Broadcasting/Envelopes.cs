using System.Text.Json.Serialization;
using Blotter.Contracts.Wire;

namespace Blotter.Realtime.Broadcasting;

/// <summary>
/// A trade broadcast, matching <c>broadcast_envelope_schema</c>. <c>seq</c> is shared by every
/// enveloped event, so a client that sees 41 then 43 knows it missed one and refetches.
/// </summary>
/// <param name="Seq">Position in the stream.</param>
/// <param name="EmittedAt">When the envelope was stamped, which is what broadcast lag is measured to.</param>
/// <param name="Trade">The whole trade, so a client replaces rather than patches.</param>
internal sealed record TradeEnvelope(
    [property: JsonPropertyName("seq")] long Seq,
    [property: JsonPropertyName("emitted_at")] DateTimeOffset EmittedAt,
    [property: JsonPropertyName("trade")] Trade Trade);

/// <summary>An audit-row broadcast, matching <c>trade_event_envelope_schema</c>.</summary>
/// <param name="Seq">Position in the stream.</param>
/// <param name="EmittedAt">When the envelope was stamped.</param>
/// <param name="Event">The audit row, the same one the history endpoints serve.</param>
internal sealed record TradeEventEnvelope(
    [property: JsonPropertyName("seq")] long Seq,
    [property: JsonPropertyName("emitted_at")] DateTimeOffset EmittedAt,
    [property: JsonPropertyName("event")] TradeEvent Event);

/// <summary>A position broadcast, matching <c>position_envelope_schema</c>.</summary>
/// <param name="Seq">Position in the stream.</param>
/// <param name="EmittedAt">When the envelope was stamped.</param>
/// <param name="Position">The symbol's whole position, never a delta.</param>
internal sealed record PositionEnvelope(
    [property: JsonPropertyName("seq")] long Seq,
    [property: JsonPropertyName("emitted_at")] DateTimeOffset EmittedAt,
    [property: JsonPropertyName("position")] Position Position);
