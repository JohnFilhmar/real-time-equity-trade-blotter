using System.Text.Json;
using System.Text.Json.Serialization;
using Blotter.Contracts.Json;
using Blotter.Contracts.Messages;
using Blotter.Contracts.Wire;

namespace Blotter.Trades.Outbox;

/// <summary>
/// What a write leaves in the outbox: everything the broker message needs except the position, which
/// the dispatcher computes from committed trades at the moment it publishes, so the last position a
/// client receives for a symbol always reflects every write before it.
/// </summary>
/// <param name="Kind">Booked, amended or cancelled.</param>
/// <param name="Trade">The trade after the write.</param>
/// <param name="Event">The audit row, or null for a booking.</param>
internal sealed record OutboxPayload(
    [property: JsonPropertyName("kind")] TradeChangeKind Kind,
    [property: JsonPropertyName("trade")] Trade Trade,
    [property: JsonPropertyName("event")] TradeEvent? Event)
{
    /// <summary>Serialises the payload for the <c>payload</c> column.</summary>
    /// <returns>JSON text.</returns>
    public string ToJson() => JsonSerializer.Serialize(this, BlotterJson.Options);

    /// <summary>Reads a payload back from the <c>payload</c> column.</summary>
    /// <param name="json">The stored JSON.</param>
    /// <returns>The payload.</returns>
    /// <exception cref="JsonException">When the stored payload does not match this shape.</exception>
    public static OutboxPayload FromJson(string json) =>
        JsonSerializer.Deserialize<OutboxPayload>(json, BlotterJson.Options)
            ?? throw new JsonException("A stored outbox payload was null");
}
