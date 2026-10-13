using Blotter.Contracts.Reference;
using FluentValidation;
using Proto = Blotter.Contracts.Grpc;

namespace Blotter.Trades.Api.Validation;

/// <summary>Rules for <see cref="Proto.CreateTradeRequest"/>.</summary>
internal sealed class CreateTradeRequestValidator : AbstractValidator<Proto.CreateTradeRequest>
{
    /// <summary>Declares the rules.</summary>
    /// <param name="clock">The clock the future-time rule compares against.</param>
    public CreateTradeRequestValidator(TimeProvider clock)
    {
        RuleFor(request => request.Symbol)
            .Must(symbol => Instruments.Find(symbol) is not null).WithMessage(TradeRules.Messages.ChooseSymbol)
            .OverridePropertyName("symbol");
        RuleFor(request => request.Side)
            .Must(side => side is Proto.Side.Buy or Proto.Side.Sell).WithMessage(TradeRules.Messages.ChooseSide)
            .OverridePropertyName("side");
        RuleFor(request => request.Quantity).TradeQuantity();
        RuleFor(request => request.Price).TradePrice();
        RuleFor(request => request.Book).TradeBook();
        RuleFor(request => request.Counterparty)
            .Cascade(CascadeMode.Stop)
            .Must(name => name.Trim().Length > 0).WithMessage(TradeRules.Messages.EnterCounterparty)
            .Must(name => name.Trim().Length <= TradeRules.MaxCounterpartyLength).WithMessage(TradeRules.Messages.CounterpartyTooLong)
            .OverridePropertyName("counterparty");
        RuleFor(request => request.TradeTimestamp)
            .Cascade(CascadeMode.Stop)
            .NotNull().WithMessage(TradeRules.Messages.EnterTradeTime)
            .Must(timestamp => timestamp.ToDateTimeOffset() <= clock.GetUtcNow() + TradeRules.FutureTolerance)
            .WithMessage(TradeRules.Messages.TradeTimeInFuture)
            .OverridePropertyName("tradeTimestamp");
    }
}
