using Blotter.Contracts.Reference;
using FluentValidation;
using Proto = Blotter.Contracts.Grpc;

namespace Blotter.Trades.Api.Validation;

/// <summary>Rules for <see cref="Proto.CancelTradeRequest"/>.</summary>
internal sealed class CancelTradeRequestValidator : AbstractValidator<Proto.CancelTradeRequest>
{
    /// <summary>Declares the rules.</summary>
    public CancelTradeRequestValidator()
    {
        RuleFor(request => request.TradeId).BusinessTradeId();
        RuleFor(request => request.Version)
            .GreaterThan(0).WithMessage(TradeRules.Messages.ReloadTrade)
            .When(request => request.HasVersion)
            .OverridePropertyName("version");
    }
}
