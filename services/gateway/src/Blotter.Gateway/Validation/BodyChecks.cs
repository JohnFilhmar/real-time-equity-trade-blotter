using System.Text.Json;
using Blotter.Contracts.Reference;
using Blotter.Gateway.Validation.JavaScript;

namespace Blotter.Gateway.Validation;

/// <summary>
/// The field rules of the shared Zod schemas, applied to raw JSON values with Zod's exact messages
/// and its split between type-level and range failures. Numbers are judged as JavaScript doubles,
/// because that is what Zod saw; the accepted value is then read again as an exact decimal.
/// </summary>
internal static class BodyChecks
{
    /// <summary>A value that must be one of a fixed set of strings, such as a symbol or a side.</summary>
    /// <param name="value">The raw value.</param>
    /// <param name="allowed">The allowed strings, case-sensitive.</param>
    /// <param name="message">The message for anything else.</param>
    /// <returns>The check.</returns>
    public static Check OneOf(JsonElement value, IReadOnlyCollection<string> allowed, string message) =>
        value.ValueKind == JsonValueKind.String && allowed.Contains(value.GetString()!) ? Check.Pass : Check.Abort(message);

    /// <summary>A string, trimmed the JavaScript way, between two lengths.</summary>
    /// <param name="value">The raw value.</param>
    /// <param name="typeMessage">The message when it is missing or not a string.</param>
    /// <param name="emptyMessage">The message when it is empty once trimmed.</param>
    /// <param name="max">The longest it may be once trimmed.</param>
    /// <param name="tooLongMessage">The message when it is longer.</param>
    /// <returns>The check.</returns>
    public static Check TrimmedText(JsonElement value, string typeMessage, string emptyMessage, int max, string tooLongMessage)
    {
        if (value.ValueKind != JsonValueKind.String)
        {
            return Check.Abort(typeMessage);
        }

        var text = JsText.Trim(value.GetString()!);
        return text.Length == 0 ? Check.Fail(emptyMessage) : text.Length > max ? Check.Fail(tooLongMessage) : Check.Pass;
    }

    /// <summary>The ticket's quantity: <c>z.int({abort: true}).positive().max(10_000_000)</c> with its custom messages.</summary>
    /// <param name="value">The raw value.</param>
    /// <returns>The check.</returns>
    public static Check Quantity(JsonElement value)
    {
        if (!TryNumber(value, out var number))
        {
            return Check.Abort(TradeRules.Messages.EnterQuantity);
        }

        if (!JsNumber.IsSafeInteger(number))
        {
            return Check.Abort(number > TradeRules.MaxQuantity ? TradeRules.Messages.QuantityTooLarge : TradeRules.Messages.QuantityWhole);
        }

        return number <= 0 ? Check.Fail(TradeRules.Messages.QuantityWhole)
            : number > TradeRules.MaxQuantity ? Check.Fail(TradeRules.Messages.QuantityTooLarge)
            : Check.Pass;
    }

    /// <summary>The ticket's price: <c>z.number().positive().max(10_000_000)</c> with its custom messages.</summary>
    /// <param name="value">The raw value.</param>
    /// <returns>The check.</returns>
    public static Check Price(JsonElement value)
    {
        if (!TryNumber(value, out var number))
        {
            return Check.Abort(TradeRules.Messages.EnterPrice);
        }

        return number <= 0 ? Check.Fail(TradeRules.Messages.PricePositive)
            : number > (double)TradeRules.MaxPrice ? Check.Fail(TradeRules.Messages.PriceTooLarge)
            : Check.Pass;
    }

    /// <summary>A trade version: <c>z.int().positive()</c>, every failure saying to reload.</summary>
    /// <param name="value">The raw value.</param>
    /// <returns>The check.</returns>
    public static Check Version(JsonElement value)
    {
        if (!TryNumber(value, out var number) || !JsNumber.IsSafeInteger(number))
        {
            return Check.Abort(TradeRules.Messages.ReloadTrade);
        }

        return number <= 0 ? Check.Fail(TradeRules.Messages.ReloadTrade) : Check.Pass;
    }

    /// <summary>An ISO 8601 UTC timestamp in the exact form <c>z.iso.datetime()</c> accepts.</summary>
    /// <param name="value">The raw value.</param>
    /// <param name="message">The message for anything else.</param>
    /// <returns>The check. A wrong format is not type-level, so object refines still run.</returns>
    public static Check IsoDateTime(JsonElement value, string message)
    {
        if (value.ValueKind != JsonValueKind.String)
        {
            return Check.Abort(message);
        }

        return ZodFormats.IsIsoDateTime(value.GetString()!) ? Check.Pass : Check.Fail(message);
    }

    /// <summary>Reads a JSON number as JavaScript did. Strings, booleans, null, absence and infinities all fail.</summary>
    /// <param name="value">The raw value.</param>
    /// <param name="number">The number, when there is one.</param>
    /// <returns>True for a finite JSON number.</returns>
    public static bool TryNumber(JsonElement value, out double number)
    {
        number = 0;
        return value.ValueKind == JsonValueKind.Number && value.TryGetDouble(out number) && double.IsFinite(number);
    }
}
