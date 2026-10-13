using System.Text.Json.Serialization;

namespace Blotter.Contracts.Wire;

/// <summary>
/// The desk's net position in one instrument, built from its active trades only, matching
/// <c>position_schema</c> in <c>shared/src/schemas/position.ts</c>. Every money figure is in the
/// instrument's own quote currency, so a London name reports pence.
/// </summary>
/// <param name="Symbol">The instrument.</param>
/// <param name="Currency">Its quote currency.</param>
/// <param name="NetQuantity">Bought minus sold. Negative when the book is net short.</param>
/// <param name="BuyQuantity">Shares bought across the counted trades.</param>
/// <param name="SellQuantity">Shares sold across the counted trades.</param>
/// <param name="GrossNotional">Sum of quantity times price over the counted trades.</param>
/// <param name="TradeCount">How many active trades were counted.</param>
/// <param name="AveragePrice">Average cost of the open position. Zero when flat.</param>
/// <param name="RealisedPnl">Profit or loss realised by trades that closed against the position.</param>
public sealed record Position(
    [property: JsonPropertyName("symbol")] string Symbol,
    [property: JsonPropertyName("currency")] Currency Currency,
    [property: JsonPropertyName("netQuantity")] long NetQuantity,
    [property: JsonPropertyName("buyQuantity")] long BuyQuantity,
    [property: JsonPropertyName("sellQuantity")] long SellQuantity,
    [property: JsonPropertyName("grossNotional")] decimal GrossNotional,
    [property: JsonPropertyName("tradeCount")] int TradeCount,
    [property: JsonPropertyName("averagePrice")] decimal AveragePrice,
    [property: JsonPropertyName("realisedPnl")] decimal RealisedPnl);
