using FluentValidation;
using Proto = Blotter.Contracts.Grpc;

namespace Blotter.Trades.Api.Validation;

/// <summary>Rules for <see cref="Proto.ListEventsRequest"/>.</summary>
internal sealed class ListEventsRequestValidator : AbstractValidator<Proto.ListEventsRequest>
{
    /// <summary>Declares the rules.</summary>
    public ListEventsRequestValidator() =>
        RuleFor(request => request.Limit).InclusiveBetween(1, 500).OverridePropertyName("limit");
}
