using System.Globalization;
using Blotter.Contracts.Json;
using Blotter.Contracts.Reference;
using FluentValidation;

namespace Blotter.Trades.Api.Validation;

/// <summary>
/// Field rules for the gRPC requests, reused across the request validators so one field is checked
/// one way everywhere. The gateway has already applied the same limits with the frontend's exact
/// messages; these hold the line for anything else that reaches the trades service.
/// </summary>
internal static class ProtoRules
{
    private const NumberStyles DecimalStyle = NumberStyles.AllowLeadingSign | NumberStyles.AllowDecimalPoint;

    /// <summary>A business trade id, reported under <c>trade_id</c> as the Node API's path check did.</summary>
    /// <typeparam name="T">The request type.</typeparam>
    /// <param name="rule">The rule being built.</param>
    /// <returns>The rule.</returns>
    public static IRuleBuilderOptions<T, string> BusinessTradeId<T>(this IRuleBuilder<T, string> rule) =>
        rule.Must(TradeRules.IsTradeId).WithMessage(TradeRules.Messages.TradeIdShape).OverridePropertyName("trade_id");

    /// <summary>A share count from 1 to 10,000,000.</summary>
    /// <typeparam name="T">The request type.</typeparam>
    /// <param name="rule">The rule being built.</param>
    /// <returns>The rule.</returns>
    public static IRuleBuilderOptions<T, int> TradeQuantity<T>(this IRuleBuilderInitial<T, int> rule) =>
        rule.Cascade(CascadeMode.Stop)
            .GreaterThan(0).WithMessage(TradeRules.Messages.QuantityWhole)
            .LessThanOrEqualTo(TradeRules.MaxQuantity).WithMessage(TradeRules.Messages.QuantityTooLarge)
            .OverridePropertyName("quantity");

    /// <summary>An exact decimal price above zero, at most 10,000,000, with at most six decimal places.</summary>
    /// <typeparam name="T">The request type.</typeparam>
    /// <param name="rule">The rule being built.</param>
    /// <returns>The rule.</returns>
    public static IRuleBuilderOptions<T, string> TradePrice<T>(this IRuleBuilderInitial<T, string> rule) =>
        rule.Cascade(CascadeMode.Stop)
            .Must(text => TryParse(text, out _)).WithMessage(TradeRules.Messages.EnterPrice)
            .Must(text => TryParse(text, out var price) && price > 0).WithMessage(TradeRules.Messages.PricePositive)
            .Must(text => TryParse(text, out var price) && price <= TradeRules.MaxPrice).WithMessage(TradeRules.Messages.PriceTooLarge)
            .Must(text => TryParse(text, out var price) && ExactDecimal.Normalize(price).Scale <= TradeRules.PriceScale)
            .WithMessage("Price cannot have more than 6 decimal places")
            .OverridePropertyName("price");

    /// <summary>A book, 1 to 64 characters once trimmed.</summary>
    /// <typeparam name="T">The request type.</typeparam>
    /// <param name="rule">The rule being built.</param>
    /// <returns>The rule.</returns>
    public static IRuleBuilderOptions<T, string> TradeBook<T>(this IRuleBuilderInitial<T, string> rule) =>
        rule.Cascade(CascadeMode.Stop)
            .Must(book => book.Trim().Length > 0).WithMessage(TradeRules.Messages.EnterBook)
            .Must(book => book.Trim().Length <= TradeRules.MaxBookLength).WithMessage(TradeRules.Messages.BookTooLong)
            .OverridePropertyName("book");

    /// <summary>Parses the decimal text a price travels as.</summary>
    /// <param name="text">The text.</param>
    /// <param name="price">The value, when it parsed.</param>
    /// <returns>True when the text is a plain invariant decimal.</returns>
    public static bool TryParse(string? text, out decimal price) =>
        decimal.TryParse(text, DecimalStyle, CultureInfo.InvariantCulture, out price);
}
