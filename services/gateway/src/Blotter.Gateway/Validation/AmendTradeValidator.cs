using Blotter.Contracts.Reference;

namespace Blotter.Gateway.Validation;

/// <summary>
/// <c>amend_trade_schema</c>: quantity, price and book are optional, the version is required, and a
/// counterparty is refused outright so a caller is never told 200 for a change that did not happen.
/// A field sent as null is not absent: it fails its type check, as it did in Zod.
/// </summary>
internal sealed class AmendTradeValidator : BodyValidator
{
    /// <summary>Declares the rules.</summary>
    public AmendTradeValidator()
    {
        Field("quantity", body => body.Has("quantity") ? BodyChecks.Quantity(body["quantity"]) : Check.Pass);
        Field("price", body => body.Has("price") ? BodyChecks.Price(body["price"]) : Check.Pass);
        Field("book", body => body.Has("book") ? CreateTradeValidator.Book(body) : Check.Pass);
        Field("version", body => BodyChecks.Version(body["version"]));
        Field("counterparty", body => body.Has("counterparty") ? Check.Abort(TradeRules.Messages.CounterpartyFixed) : Check.Pass);
    }
}
