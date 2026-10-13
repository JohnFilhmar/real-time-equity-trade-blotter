using System.Text.Json.Serialization;
using Blotter.Contracts.Wire;

namespace Blotter.Contracts.Messages;

/// <summary>
/// What the trades service publishes after every committed write, and what the realtime service
/// fans out. The realtime service emits the trade, then the event when there is one, then the
/// position, which is the order the Node API broadcast them in.
/// </summary>
/// <param name="Kind">Booked, amended or cancelled.</param>
/// <param name="Trade">The whole trade after the write, so a client replaces rather than patches.</param>
/// <param name="Event">The audit row the write recorded. Null for a booking, which writes none.</param>
/// <param name="Position">The symbol's position, recomputed from committed trades when the message was published.</param>
public sealed record TradeChanged(
    [property: JsonPropertyName("kind")] TradeChangeKind Kind,
    [property: JsonPropertyName("trade")] Trade Trade,
    [property: JsonPropertyName("event")] TradeEvent? Event,
    [property: JsonPropertyName("position")] Position Position);
