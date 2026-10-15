using FluentValidation;
using Proto = Blotter.Contracts.Grpc;

namespace Blotter.Trades.Api.Validation;

/// <summary>Rules for <see cref="Proto.TradeRef"/>.</summary>
internal sealed class TradeRefValidator : AbstractValidator<Proto.TradeRef>
{
    /// <summary>Declares the rules.</summary>
    public TradeRefValidator() => RuleFor(request => request.TradeId).BusinessTradeId();
}
