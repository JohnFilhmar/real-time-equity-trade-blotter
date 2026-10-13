using System.Text.Json;
using Blotter.Contracts.Json;
using Blotter.Contracts.Wire;

namespace Blotter.Trades.Data;

/// <summary>The one path from a stored row to the wire record the API, the broker and the tests all see.</summary>
internal static class RowMapping
{
    /// <summary>Converts a trade row to its wire record.</summary>
    /// <param name="row">The stored row.</param>
    /// <returns>The trade.</returns>
    public static Trade ToWire(TradeRow row) => new(
        row.Id,
        row.TradeId,
        row.Symbol,
        row.Side,
        row.Quantity,
        row.Price,
        row.Currency,
        row.Trader,
        row.Book,
        row.Counterparty,
        row.TradeTimestamp,
        row.Status,
        row.Version,
        row.CreatedAt,
        row.UpdatedAt);

    /// <summary>
    /// Converts an event row to its wire record. The stored change set is parsed rather than trusted,
    /// so a malformed row fails loudly here instead of reaching a client half-shaped.
    /// </summary>
    /// <param name="row">The stored event.</param>
    /// <param name="tradeId">The business id of its trade, which the row holds only as a uuid.</param>
    /// <returns>The event.</returns>
    /// <exception cref="JsonException">When the stored change set does not match the contract.</exception>
    public static TradeEvent ToWire(TradeEventRow row, string tradeId) => new(
        row.Id,
        tradeId,
        row.Version,
        row.Action,
        row.Source,
        ParseChanges(row.Changes),
        row.Actor,
        row.OccurredAt);

    /// <summary>Serialises a change set for the <c>changes</c> column, keeping its order.</summary>
    /// <param name="changes">The change set.</param>
    /// <returns>JSON text.</returns>
    public static string WriteChanges(IReadOnlyDictionary<string, FieldChange> changes) =>
        JsonSerializer.Serialize(changes, BlotterJson.Options);

    private static Dictionary<string, FieldChange> ParseChanges(string json) =>
        JsonSerializer.Deserialize<Dictionary<string, FieldChange>>(json, BlotterJson.Options)
            ?? throw new JsonException("A stored change set was null");
}
