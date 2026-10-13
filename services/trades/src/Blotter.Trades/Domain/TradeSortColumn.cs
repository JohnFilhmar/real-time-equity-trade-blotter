using System.Text.Json.Serialization;

namespace Blotter.Trades.Domain;

/// <summary>
/// Every column the blotter can sort on, which is every column the grid shows. The wire names are
/// the trade's own field names, as <c>trade_sort_columns</c> lists them in the shared package.
/// </summary>
internal enum TradeSortColumn
{
    /// <summary>Business id.</summary>
    [JsonStringEnumMemberName("tradeId")]
    TradeId,

    /// <summary>Ticker.</summary>
    [JsonStringEnumMemberName("symbol")]
    Symbol,

    /// <summary>Buy or sell.</summary>
    [JsonStringEnumMemberName("side")]
    Side,

    /// <summary>Share count.</summary>
    [JsonStringEnumMemberName("quantity")]
    Quantity,

    /// <summary>Price.</summary>
    [JsonStringEnumMemberName("price")]
    Price,

    /// <summary>Desk code.</summary>
    [JsonStringEnumMemberName("trader")]
    Trader,

    /// <summary>Book.</summary>
    [JsonStringEnumMemberName("book")]
    Book,

    /// <summary>Counterparty.</summary>
    [JsonStringEnumMemberName("counterparty")]
    Counterparty,

    /// <summary>Execution time, the default.</summary>
    [JsonStringEnumMemberName("tradeTimestamp")]
    TradeTimestamp,

    /// <summary>Active or cancelled.</summary>
    [JsonStringEnumMemberName("status")]
    Status,
}
