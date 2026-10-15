using Blotter.Contracts.Reference;
using FluentValidation;
using Proto = Blotter.Contracts.Grpc;

namespace Blotter.Trades.Api.Validation;

/// <summary>Rules for <see cref="Proto.AmendTradeRequest"/>. Absent fields are left as they are.</summary>
internal sealed class AmendTradeRequestValidator : AbstractValidator<Proto.AmendTradeRequest>
{
    /// <summary>Declares the rules.</summary>
    public AmendTradeRequestValidator()
    {
        RuleFor(request => request.TradeId).BusinessTradeId();
        RuleFor(request => request.Version).GreaterThan(0).WithMessage(TradeRules.Messages.ReloadTrade).OverridePropertyName("version");
        RuleFor(request => request.Quantity).TradeQuantity().When(request => request.HasQuantity);
        RuleFor(request => request.Price).TradePrice().When(request => request.HasPrice);
        RuleFor(request => request.Book).TradeBook().When(request => request.HasBook);
    }
}
