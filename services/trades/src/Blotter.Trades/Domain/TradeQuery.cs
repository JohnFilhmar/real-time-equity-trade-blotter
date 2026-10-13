using Blotter.Contracts.Wire;

namespace Blotter.Trades.Domain;

/// <summary>A validated blotter query: filters, one sort column, a page size and an optional cursor.</summary>
/// <param name="Symbol">Case-insensitive substring of the ticker, or null for any.</param>
/// <param name="Side">Exact side, or null for any.</param>
/// <param name="Status">Exact status, or null for any.</param>
/// <param name="Trader">Case-insensitive substring of the desk code, or null for any.</param>
/// <param name="Book">Case-insensitive substring of the book, or null for any.</param>
/// <param name="Counterparty">Case-insensitive substring of the counterparty, or null for any.</param>
/// <param name="DateFrom">Inclusive lower bound on execution time, or null.</param>
/// <param name="DateTo">Inclusive upper bound on execution time, or null.</param>
/// <param name="SortBy">The sort column. The row id always breaks ties, in the same direction.</param>
/// <param name="Descending">True for newest or largest first.</param>
/// <param name="Limit">Page size, 1 to 1,000.</param>
/// <param name="Cursor">The last row of the previous page, or null for the first page.</param>
internal sealed record TradeQuery(
    string? Symbol,
    TradeSide? Side,
    TradeStatus? Status,
    string? Trader,
    string? Book,
    string? Counterparty,
    DateTimeOffset? DateFrom,
    DateTimeOffset? DateTo,
    TradeSortColumn SortBy,
    bool Descending,
    int Limit,
    Guid? Cursor);
