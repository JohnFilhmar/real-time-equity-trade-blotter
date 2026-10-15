using System.Globalization;
using System.Text.RegularExpressions;

namespace Blotter.Gateway.Validation.JavaScript;

/// <summary>
/// JavaScript number semantics for the query string, where Zod's <c>z.coerce.number()</c> ran
/// <c>Number(value)</c>: an empty string is 0, <c>0x10</c> is 16, <c>1e2</c> is 100, and anything
/// else unreadable is NaN.
/// </summary>
internal static partial class JsNumber
{
    /// <summary>The largest integer a double holds exactly, <c>Number.MAX_SAFE_INTEGER</c>.</summary>
    public const double MaxSafeInteger = 9_007_199_254_740_991;

    /// <summary>Converts text the way <c>Number(text)</c> does.</summary>
    /// <param name="text">The raw value.</param>
    /// <returns>The number, which may be NaN or an infinity.</returns>
    public static double FromString(string text)
    {
        var value = JsText.Trim(text);

        if (value.Length == 0)
        {
            return 0;
        }

        if (value is "Infinity" or "+Infinity")
        {
            return double.PositiveInfinity;
        }

        if (value == "-Infinity")
        {
            return double.NegativeInfinity;
        }

        if (value.Length > 2 && value[0] == '0' && char.ToLowerInvariant(value[1]) is 'x' or 'o' or 'b')
        {
            var radix = char.ToLowerInvariant(value[1]) switch { 'x' => 16, 'o' => 8, _ => 2 };
            return FromDigits(value[2..], radix);
        }

        return DecimalLiteral().IsMatch(value)
            ? double.Parse(value, NumberStyles.Float, CultureInfo.InvariantCulture)
            : double.NaN;
    }

    /// <summary>Whether a value is an integer a double holds exactly, which is what Zod's <c>.int()</c> accepts.</summary>
    /// <param name="value">The number.</param>
    /// <returns>True for finite whole numbers within ±<see cref="MaxSafeInteger"/>.</returns>
    public static bool IsSafeInteger(double value) =>
        double.IsFinite(value) && Math.Floor(value) == value && Math.Abs(value) <= MaxSafeInteger;

    /// <summary>How Zod names a value it refused as a number: <c>NaN</c>, <c>Infinity</c> or <c>-Infinity</c>.</summary>
    /// <param name="value">A value that is NaN or infinite.</param>
    /// <returns>The name Zod's message uses.</returns>
    public static string Describe(double value) =>
        double.IsNaN(value) ? "NaN" : value > 0 ? "Infinity" : "-Infinity";

    private static double FromDigits(string digits, int radix)
    {
        double value = 0;
        foreach (var character in digits)
        {
            var digit = character switch
            {
                >= '0' and <= '9' => character - '0',
                >= 'a' and <= 'f' => character - 'a' + 10,
                >= 'A' and <= 'F' => character - 'A' + 10,
                _ => int.MaxValue,
            };

            if (digit >= radix)
            {
                return double.NaN;
            }

            value = (value * radix) + digit;
        }

        return value;
    }

    [GeneratedRegex(@"^[+-]?(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$", RegexOptions.CultureInvariant)]
    private static partial Regex DecimalLiteral();
}
