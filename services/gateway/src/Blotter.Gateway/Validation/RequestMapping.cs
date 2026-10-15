using System.Text.Json;
using Blotter.Contracts.Json;
using Blotter.Contracts.Reference;
using Blotter.Gateway.Validation.JavaScript;
using Google.Protobuf.WellKnownTypes;
using Proto = Blotter.Contracts.Grpc;

namespace Blotter.Gateway.Validation;

/// <summary>
/// Turns validated input into the trades service's gRPC requests. Prices leave here as exact decimal
/// text rounded to six places, the precision of the price column, the way <c>toFixed(6)</c> stored
/// them; free text is trimmed the JavaScript way; timestamps are read as <c>Date.parse</c> read them.
/// Only ever called after the matching validator passed.
/// </summary>
internal static class RequestMapping
{
    /// <summary>The login credentials: the trimmed username and the password exactly as typed.</summary>
    /// <param name="body">A validated login body.</param>
    /// <returns>The username and password.</returns>
    public static (string Username, string Password) ToLogin(JsonBody body) =>
        (JsText.Trim(body["username"].GetString()!), body["password"].GetString()!);

    /// <summary>Builds the booking request. The trader and currency are not taken from the body.</summary>
    /// <param name="body">A validated ticket.</param>
    /// <returns>The request.</returns>
    public static Proto.CreateTradeRequest ToCreate(JsonBody body) => new()
    {
        Symbol = body["symbol"].GetString()!,
        Side = body["side"].GetString() == "BUY" ? Proto.Side.Buy : Proto.Side.Sell,
        Quantity = (int)body["quantity"].GetDouble(),
        Price = Price(body["price"]),
        Book = JsText.Trim(body["book"].GetString()!),
        Counterparty = JsText.Trim(body["counterparty"].GetString()!),
        TradeTimestamp = Timestamp.FromDateTimeOffset(JsDate.Parse(body["tradeTimestamp"].GetString())!.Value),
    };

    /// <summary>Builds the amendment request, carrying only the fields that were sent.</summary>
    /// <param name="tradeId">The validated trade id.</param>
    /// <param name="body">A validated amendment.</param>
    /// <returns>The request.</returns>
    public static Proto.AmendTradeRequest ToAmend(string tradeId, JsonBody body)
    {
        var request = new Proto.AmendTradeRequest { TradeId = tradeId, Version = (int)body["version"].GetDouble() };

        if (body.Has("quantity"))
        {
            request.Quantity = (int)body["quantity"].GetDouble();
        }

        if (body.Has("price"))
        {
            request.Price = Price(body["price"]);
        }

        if (body.Has("book"))
        {
            request.Book = JsText.Trim(body["book"].GetString()!);
        }

        return request;
    }

    /// <summary>Builds the cancellation request, with the version guard when one was sent.</summary>
    /// <param name="tradeId">The validated trade id.</param>
    /// <param name="body">A validated cancellation body.</param>
    /// <returns>The request.</returns>
    public static Proto.CancelTradeRequest ToCancel(string tradeId, JsonBody body)
    {
        var request = new Proto.CancelTradeRequest { TradeId = tradeId };
        if (body.Has("version"))
        {
            request.Version = (int)body["version"].GetDouble();
        }

        return request;
    }

    /// <summary>Builds the blotter query with the schema's defaults: newest execution first, 100 rows.</summary>
    /// <param name="query">A validated query.</param>
    /// <returns>The request.</returns>
    public static Proto.ListTradesRequest ToList(QueryInput query)
    {
        var request = new Proto.ListTradesRequest
        {
            Symbol = query["symbol"].ToString(),
            Trader = query["trader"].ToString(),
            Book = query["book"].ToString(),
            Counterparty = query["counterparty"].ToString(),
            Side = query["side"].ToString() switch { "BUY" => Proto.Side.Buy, "SELL" => Proto.Side.Sell, _ => Proto.Side.Unspecified },
            Status = query["status"].ToString() switch
            {
                "ACTIVE" => Proto.TradeStatus.Active,
                "CANCELLED" => Proto.TradeStatus.Cancelled,
                _ => Proto.TradeStatus.Unspecified,
            },
            SortBy = query["sort_by"].Count == 0 ? "tradeTimestamp" : query["sort_by"].ToString(),
            SortDir = query["sort_dir"].ToString() == "asc" ? Proto.SortDirection.Asc : Proto.SortDirection.Desc,
            Limit = query["limit"].Count == 0 ? 100 : (int)QueryChecks.Coerce(query["limit"]),
            Cursor = query["cursor"].ToString(),
        };

        if (JsDate.Parse(query["date_from"].ToString()) is { } from)
        {
            request.DateFrom = Timestamp.FromDateTimeOffset(from);
        }

        if (JsDate.Parse(query["date_to"].ToString()) is { } to)
        {
            request.DateTo = Timestamp.FromDateTimeOffset(to);
        }

        return request;
    }

    /// <summary>Builds the event feed query, 100 events by default.</summary>
    /// <param name="query">A validated query.</param>
    /// <returns>The request.</returns>
    public static Proto.ListEventsRequest ToEvents(QueryInput query) => new()
    {
        Limit = query["limit"].Count == 0 ? 100 : (int)QueryChecks.Coerce(query["limit"]),
        Cursor = query["cursor"].ToString(),
    };

    /// <summary>
    /// Reads a validated JSON number as an exact decimal, from its digits rather than through a
    /// double, then rounds it to the price column's six places.
    /// </summary>
    private static string Price(JsonElement value)
    {
        var exact = value.TryGetDecimal(out var parsed) ? parsed : 0m;
        return ExactDecimal.Format(decimal.Round(exact, TradeRules.PriceScale, MidpointRounding.AwayFromZero));
    }
}
