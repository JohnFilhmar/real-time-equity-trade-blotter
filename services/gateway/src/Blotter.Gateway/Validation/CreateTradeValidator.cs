using System.Text.Json;
using Blotter.Contracts.Json;
using Blotter.Contracts.Reference;
using Blotter.Contracts.Wire;
using Blotter.Gateway.Validation.JavaScript;

namespace Blotter.Gateway.Validation;

/// <summary>
/// <c>create_trade_schema</c>: the seven ticket fields in schema order, then the future-time rule,
/// which reads the timestamp the way <c>Date.parse</c> did and only runs when every field passed its
/// type check. Server-owned fields a client sends, such as trader or currency, are ignored.
/// </summary>
internal sealed class CreateTradeValidator : BodyValidator
{
    private static readonly string[] Symbols = [.. Instruments.All.Select(instrument => instrument.Symbol)];

    /// <summary>Declares the rules.</summary>
    /// <param name="clock">The clock the future-time rule compares against.</param>
    public CreateTradeValidator(TimeProvider clock)
    {
        Field("symbol", body => BodyChecks.OneOf(body["symbol"], Symbols, TradeRules.Messages.ChooseSymbol));
        Field("side", body => BodyChecks.OneOf(body["side"], WireNames.All<TradeSide>(), TradeRules.Messages.ChooseSide));
        Field("quantity", body => BodyChecks.Quantity(body["quantity"]));
        Field("price", body => BodyChecks.Price(body["price"]));
        Field("book", body => Book(body));
        Field("counterparty", body => BodyChecks.TrimmedText(
            body["counterparty"],
            TradeRules.Messages.EnterCounterparty,
            TradeRules.Messages.EnterCounterparty,
            TradeRules.MaxCounterpartyLength,
            TradeRules.Messages.CounterpartyTooLong));
        Field("tradeTimestamp", body => BodyChecks.IsoDateTime(body["tradeTimestamp"], TradeRules.Messages.EnterTradeTime));
        Refine("tradeTimestamp", TradeRules.Messages.TradeTimeInFuture, body =>
            body["tradeTimestamp"].ValueKind == JsonValueKind.String
            && JsDate.Parse(body["tradeTimestamp"].GetString()) is { } executedAt
            && executedAt > clock.GetUtcNow() + TradeRules.FutureTolerance);
    }

    /// <summary>The book rule an amendment shares with a booking.</summary>
    /// <param name="body">The body.</param>
    /// <returns>The check.</returns>
    public static Check Book(JsonBody body) => BodyChecks.TrimmedText(
        body["book"], TradeRules.Messages.EnterBook, TradeRules.Messages.EnterBook, TradeRules.MaxBookLength, TradeRules.Messages.BookTooLong);
}
