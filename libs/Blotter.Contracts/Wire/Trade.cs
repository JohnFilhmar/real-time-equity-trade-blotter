using System.Text.Json.Serialization;

namespace Blotter.Contracts.Wire;

/// <summary>
/// A trade as the REST API and the real-time hub publish it. Every name and format here matches
/// <c>trade_schema</c> in <c>shared/src/schemas/trade.ts</c>, which the frontend parses, so this
/// record and that schema change together or not at all.
/// </summary>
/// <param name="Id">Row uuid, assigned by the trades service.</param>
/// <param name="TradeId">Business identifier, <c>TRD-</c> followed by at least six digits.</param>
/// <param name="Symbol">Ticker from the instrument universe.</param>
/// <param name="Side">Buy or sell.</param>
/// <param name="Quantity">Share count, 1 to 10,000,000.</param>
/// <param name="Price">Exact price in <paramref name="Currency"/>, at most six decimal places.</param>
/// <param name="Currency">The instrument's quote currency. GBX prices are pence.</param>
/// <param name="Trader">Desk code of whoever booked it, taken from their token.</param>
/// <param name="Book">Desk book, 1 to 64 characters.</param>
/// <param name="Counterparty">Who the desk traded with, 1 to 128 characters.</param>
/// <param name="TradeTimestamp">When it executed, to the millisecond.</param>
/// <param name="Status">Active or cancelled.</param>
/// <param name="Version">Starts at 1 and rises by one on every amendment or cancellation.</param>
/// <param name="CreatedAt">When the row was written.</param>
/// <param name="UpdatedAt">When the row last changed. Also the commit time broadcast lag is measured from.</param>
public sealed record Trade(
    [property: JsonPropertyName("id")] Guid Id,
    [property: JsonPropertyName("tradeId")] string TradeId,
    [property: JsonPropertyName("symbol")] string Symbol,
    [property: JsonPropertyName("side")] TradeSide Side,
    [property: JsonPropertyName("quantity")] int Quantity,
    [property: JsonPropertyName("price")] decimal Price,
    [property: JsonPropertyName("currency")] Currency Currency,
    [property: JsonPropertyName("trader")] string Trader,
    [property: JsonPropertyName("book")] string Book,
    [property: JsonPropertyName("counterparty")] string Counterparty,
    [property: JsonPropertyName("tradeTimestamp")] DateTimeOffset TradeTimestamp,
    [property: JsonPropertyName("status")] TradeStatus Status,
    [property: JsonPropertyName("version")] int Version,
    [property: JsonPropertyName("createdAt")] DateTimeOffset CreatedAt,
    [property: JsonPropertyName("updatedAt")] DateTimeOffset UpdatedAt);
