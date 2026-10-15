using Blotter.Contracts.Reference;

namespace Blotter.Gateway.Validation;

/// <summary>The <c>:trade_id</c> route value: refused as a 422 naming it, never a 404 that reads like a deleted trade.</summary>
internal sealed class TradeIdValidator : ZodValidator<string>
{
    /// <summary>Declares the rule.</summary>
    public TradeIdValidator() =>
        Field("trade_id", tradeId => TradeRules.IsTradeId(tradeId) ? Check.Pass : Check.Fail(TradeRules.Messages.TradeIdShape));
}
