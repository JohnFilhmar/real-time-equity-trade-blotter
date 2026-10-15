using System.Globalization;
using System.Text.RegularExpressions;

namespace Blotter.Gateway.Validation.JavaScript;

/// <summary>
/// The part of JavaScript's <c>Date.parse</c> the Node API leaned on: the ISO forms, including the
/// loose ones V8 accepts (<c>2999</c>, <c>2999-01</c>, a space for the <c>T</c>, lower-case
/// <c>t</c> and <c>z</c>, a day past the month's end rolling over, and <c>24:00:00</c>). The
/// future-time and From-after-To rules ran on this parse, not on the strict Zod format, so a value
/// the format rejects can still be in the future.
/// </summary>
internal static partial class JsDate
{
    /// <summary>
    /// Parses text into an instant, or null where <c>Date.parse</c> answers NaN. A date-time with no
    /// offset is read as UTC, which is what the Node API saw in its UTC container.
    /// </summary>
    /// <param name="text">The text.</param>
    /// <returns>The instant, truncated to the millisecond as JavaScript stores it, or null.</returns>
    public static DateTimeOffset? Parse(string? text)
    {
        if (text is null)
        {
            return null;
        }

        var match = IsoForm().Match(text);
        if (!match.Success)
        {
            return null;
        }

        var year = int.Parse(match.Groups["year"].Value, NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture);
        var month = Number(match.Groups["month"], 1);
        var day = Number(match.Groups["day"], 1);
        var hour = Number(match.Groups["hour"], 0);
        var minute = Number(match.Groups["minute"], 0);
        var second = Number(match.Groups["second"], 0);
        var fraction = match.Groups["fraction"].Value;
        var milliseconds = fraction.Length == 0 ? 0 : int.Parse(fraction.PadRight(3, '0')[..3], CultureInfo.InvariantCulture);

        var midnight = hour == 24 && minute == 0 && second == 0 && milliseconds == 0;
        if (year is < 1 or > 9999 || month is < 1 or > 12 || day is < 1 or > 31
            || (hour > 23 && !midnight) || minute > 59 || second > 59)
        {
            return null;
        }

        var offset = match.Groups["offset"].Value;
        var shift = offset.Length is 0 or 1
            ? TimeSpan.Zero
            : new TimeSpan(int.Parse(offset[1..3], CultureInfo.InvariantCulture), int.Parse(offset[4..6], CultureInfo.InvariantCulture), 0)
                * (offset[0] == '-' ? -1 : 1);

        return new DateTimeOffset(year, month, 1, 0, 0, 0, TimeSpan.Zero)
            .AddDays(day - 1)
            .AddHours(hour)
            .AddMinutes(minute)
            .AddSeconds(second)
            .AddMilliseconds(milliseconds)
            - shift;
    }

    private static int Number(Group group, int fallback) =>
        group.Success ? int.Parse(group.Value, CultureInfo.InvariantCulture) : fallback;

    [GeneratedRegex(
        @"^(?<year>[+-][0-9]{6}|[0-9]{4})(?:-(?<month>[0-9]{2})(?:-(?<day>[0-9]{2}))?)?(?:[Tt ](?<hour>[0-9]{2}):(?<minute>[0-9]{2})(?::(?<second>[0-9]{2})(?:\.(?<fraction>[0-9]+))?)?(?<offset>[Zz]|[+-][0-9]{2}:[0-9]{2})?)?$",
        RegexOptions.CultureInvariant)]
    private static partial Regex IsoForm();
}
