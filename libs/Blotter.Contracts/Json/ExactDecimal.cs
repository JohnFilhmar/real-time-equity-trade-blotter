using System.Globalization;

namespace Blotter.Contracts.Json;

/// <summary>
/// Moves money between <see cref="decimal"/> and text without ever passing through a float.
/// gRPC carries decimals as these strings and JSON writes them as numbers, so both sides of every
/// service boundary agree on the same digits.
/// </summary>
public static class ExactDecimal
{
    private const NumberStyles Style = NumberStyles.AllowLeadingSign | NumberStyles.AllowDecimalPoint;

    /// <summary>
    /// Drops trailing zeros without changing the value, so a <c>decimal(18,6)</c> column read back
    /// as 227.450000 is written as 227.45, the same digits the Node API sent.
    /// </summary>
    /// <param name="value">Any decimal.</param>
    /// <returns>The same value at the smallest scale that represents it exactly.</returns>
    public static decimal Normalize(decimal value) => value / 1.0000000000000000000000000000m;

    /// <summary>Formats a decimal as invariant text with no exponent and no trailing zeros.</summary>
    /// <param name="value">The value to format.</param>
    /// <returns>Text such as <c>227.45</c> or <c>-3</c>.</returns>
    public static string Format(decimal value) => Normalize(value).ToString(CultureInfo.InvariantCulture);

    /// <summary>Parses text written by <see cref="Format"/>.</summary>
    /// <param name="text">Invariant decimal text with an optional sign and point, no exponent.</param>
    /// <returns>The exact value.</returns>
    /// <exception cref="FormatException">When the text is not a plain decimal.</exception>
    public static decimal Parse(string text) =>
        decimal.TryParse(text, Style, CultureInfo.InvariantCulture, out var value)
            ? value
            : throw new FormatException($"'{text}' is not an invariant decimal");
}
