using Blotter.Contracts.Json;
using Blotter.Trades.Domain;
using FluentValidation;
using Proto = Blotter.Contracts.Grpc;

namespace Blotter.Trades.Api.Validation;

/// <summary>Rules for <see cref="Proto.ListTradesRequest"/>.</summary>
internal sealed class ListTradesRequestValidator : AbstractValidator<Proto.ListTradesRequest>
{
    /// <summary>Declares the rules.</summary>
    public ListTradesRequestValidator()
    {
        RuleFor(request => request.Limit)
            .InclusiveBetween(1, 1_000).WithMessage("Page size must be a whole number from 1 to 1,000")
            .OverridePropertyName("limit");
        RuleFor(request => request.SortBy)
            .Must(column => column.Length == 0 || WireNames.TryParse<TradeSortColumn>(column, out _))
            .WithMessage("Sort by one of the blotter's columns")
            .OverridePropertyName("sort_by");
        RuleFor(request => request)
            .Must(request => request.DateFrom is null || request.DateTo is null
                || request.DateFrom.ToDateTimeOffset() <= request.DateTo.ToDateTimeOffset())
            .WithMessage("From must be on or before To")
            .OverridePropertyName("date_from");
    }
}
