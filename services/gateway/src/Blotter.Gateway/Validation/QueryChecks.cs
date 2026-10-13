using Blotter.Gateway.Validation.JavaScript;
using Microsoft.Extensions.Primitives;

namespace Blotter.Gateway.Validation;

/// <summary>
/// The query-string rules of the shared Zod schemas. A repeated key arrives as an array, which a
/// string field refuses with Zod's default message and an enum or date field with its own.
/// </summary>
internal static class QueryChecks
{
    /// <summary>Zod's default message for an array where a string belongs.</summary>
    public const string ExpectedString = "Invalid input: expected string, received array";

    /// <summary>An optional free-text filter or cursor.</summary>
    /// <param name="values">The key's values.</param>
    /// <returns>The check.</returns>
    public static Check Text(StringValues values) => values.Count > 1 ? Check.Abort(ExpectedString) : Check.Pass;

    /// <summary>An optional value from a fixed set, such as a side or a sort column.</summary>
    /// <param name="values">The key's values.</param>
    /// <param name="allowed">The allowed strings, case-sensitive.</param>
    /// <param name="message">The schema's own message for anything else.</param>
    /// <returns>The check.</returns>
    public static Check OneOf(StringValues values, IReadOnlyCollection<string> allowed, string message) =>
        values.Count == 0 || (values.Count == 1 && allowed.Contains(values[0]!)) ? Check.Pass : Check.Abort(message);

    /// <summary>An optional ISO 8601 UTC timestamp.</summary>
    /// <param name="values">The key's values.</param>
    /// <param name="message">The schema's message for anything that is not one.</param>
    /// <returns>The check.</returns>
    public static Check IsoDateTime(StringValues values, string message) =>
        values.Count switch
        {
            0 => Check.Pass,
            1 => ZodFormats.IsIsoDateTime(values[0]!) ? Check.Pass : Check.Fail(message),
            _ => Check.Abort(message),
        };

    /// <summary>
    /// The blotter's page size, <c>z.coerce.number().int().min(1).max(1000)</c> with one message for
    /// every failure. A value that is not a number or not whole is type-level; out of range is not.
    /// </summary>
    /// <param name="values">The key's values.</param>
    /// <param name="message">The schema's message.</param>
    /// <returns>The check.</returns>
    public static Check PageSize(StringValues values, string message)
    {
        if (values.Count == 0)
        {
            return Check.Pass;
        }

        var number = Coerce(values);
        if (!JsNumber.IsSafeInteger(number))
        {
            return Check.Abort(message);
        }

        return number is < 1 or > 1_000 ? Check.Fail(message) : Check.Pass;
    }

    /// <summary>The event feed's page size, <c>z.coerce.number().int().min(1).max(500)</c> with Zod's default messages.</summary>
    /// <param name="values">The key's values.</param>
    /// <returns>The check.</returns>
    public static Check EventPageSize(StringValues values)
    {
        if (values.Count == 0)
        {
            return Check.Pass;
        }

        var number = Coerce(values);
        if (!double.IsFinite(number))
        {
            return Check.Abort($"Invalid input: expected number, received {JsNumber.Describe(number)}");
        }

        if (!JsNumber.IsSafeInteger(number))
        {
            return Check.Abort("Invalid input: expected int, received number");
        }

        return number < 1 ? Check.Fail("Too small: expected number to be >=1")
            : number > 500 ? Check.Fail("Too big: expected number to be <=500")
            : Check.Pass;
    }

    /// <summary>
    /// <c>Number(value)</c> on what Express produced: one string as it is, or an array, which
    /// JavaScript joins with commas and so never reads as a number once it has two items.
    /// </summary>
    /// <param name="values">The key's values, at least one.</param>
    /// <returns>The number, possibly NaN.</returns>
    public static double Coerce(StringValues values) =>
        values.Count == 1 ? JsNumber.FromString(values[0]!) : double.NaN;
}
