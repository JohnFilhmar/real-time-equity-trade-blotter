using Blotter.Gateway.Validation.JavaScript;

namespace Blotter.Gateway.Validation;

/// <summary>
/// <c>trade_query_schema</c>: the blotter's filters, sort and page, in schema order, then the rule
/// that a From after its To is refused on From rather than answered with an empty page.
/// </summary>
internal sealed class TradeQueryValidator : ZodValidator<QueryInput>
{
    /// <summary>Every column the blotter sorts on, as <c>trade_sort_columns</c> lists them.</summary>
    public static readonly string[] SortColumns =
        ["tradeId", "symbol", "side", "quantity", "price", "trader", "book", "counterparty", "tradeTimestamp", "status"];

    private const string ValidTimestamp = "Enter a valid date and time";

    /// <summary>Declares the rules.</summary>
    public TradeQueryValidator()
    {
        Field("symbol", query => QueryChecks.Text(query["symbol"]));
        Field("side", query => QueryChecks.OneOf(query["side"], ["BUY", "SELL"], "Side must be BUY or SELL"));
        Field("status", query => QueryChecks.OneOf(query["status"], ["ACTIVE", "CANCELLED"], "Status must be ACTIVE or CANCELLED"));
        Field("trader", query => QueryChecks.Text(query["trader"]));
        Field("book", query => QueryChecks.Text(query["book"]));
        Field("counterparty", query => QueryChecks.Text(query["counterparty"]));
        Field("date_from", query => QueryChecks.IsoDateTime(query["date_from"], ValidTimestamp));
        Field("date_to", query => QueryChecks.IsoDateTime(query["date_to"], ValidTimestamp));
        Field("sort_by", query => QueryChecks.OneOf(query["sort_by"], SortColumns, "Sort by one of the blotter's columns"));
        Field("sort_dir", query => QueryChecks.OneOf(query["sort_dir"], ["asc", "desc"], "Sort direction must be asc or desc"));
        Field("limit", query => QueryChecks.PageSize(query["limit"], "Page size must be a whole number from 1 to 1,000"));
        Field("cursor", query => QueryChecks.Text(query["cursor"]));
        Refine("date_from", "From must be on or before To", query =>
            query["date_from"].Count == 1 && query["date_to"].Count == 1
            && JsDate.Parse(query["date_from"][0]) is { } from
            && JsDate.Parse(query["date_to"][0]) is { } to
            && from > to);
    }
}
