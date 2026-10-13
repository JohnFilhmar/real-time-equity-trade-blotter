using System.Text.RegularExpressions;

namespace Blotter.Gateway.Validation.JavaScript;

/// <summary>The string formats the shared schemas check, ported from Zod 4.6.2's own patterns.</summary>
internal static partial class ZodFormats
{
    /// <summary>
    /// Zod's <c>z.iso.datetime()</c>: a real calendar date, a <c>T</c>, hours, minutes and seconds
    /// with any number of fractional digits, then <c>Z</c>. No offsets and no omitted seconds.
    /// </summary>
    /// <param name="value">The text.</param>
    /// <returns>True when the text has exactly that shape.</returns>
    public static bool IsIsoDateTime(string value) => IsoDateTime().IsMatch(value);

    // Zod's dateSource and timeSource with seconds required, with \d written as [0-9] because a .NET
    // \d also matches non-ASCII digits and a JavaScript \d does not.
    [GeneratedRegex(
        @"^(?:(?:[0-9][0-9][2468][048]|[0-9][0-9][13579][26]|[0-9][0-9]0[48]|[02468][048]00|[13579][26]00)-02-29|[0-9]{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12][0-9]|3[01])|(?:0[469]|11)-(?:0[1-9]|[12][0-9]|30)|(?:02)-(?:0[1-9]|1[0-9]|2[0-8])))T(?:(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](?:\.[0-9]+)?(?:Z))\z",
        RegexOptions.CultureInvariant)]
    private static partial Regex IsoDateTime();
}
