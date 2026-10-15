using System.Text.RegularExpressions;

namespace Blotter.ServiceDefaults.Http;

/// <summary>
/// The correlation id every request carries. It is taken from the caller's <c>x-request-id</c> when
/// that is safe to log and generated otherwise, then echoed on the response, written into every log
/// line and every problem document, and forwarded to the trades service.
/// </summary>
public static partial class RequestIds
{
    /// <summary>The header a caller may supply and the response always carries.</summary>
    public const string HeaderName = "x-request-id";

    /// <summary>
    /// Whether a caller-supplied id is safe to adopt: 1 to 128 letters, digits, dots, underscores,
    /// colons or dashes, which covers uuids and trace ids and nothing a log reader could misread.
    /// </summary>
    /// <param name="value">The header value, if any.</param>
    /// <returns>True when the id can be used as it is.</returns>
    public static bool IsAcceptable(string? value) => value is not null && SafeId().IsMatch(value);

    [GeneratedRegex("^[A-Za-z0-9._:-]{1,128}$", RegexOptions.CultureInvariant)]
    private static partial Regex SafeId();
}
