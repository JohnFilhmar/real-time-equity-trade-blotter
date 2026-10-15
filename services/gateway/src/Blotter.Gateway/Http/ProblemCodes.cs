namespace Blotter.Gateway.Http;

/// <summary>
/// The machine-readable codes of <c>problem_codes</c> in the shared package. The frontend parses
/// <c>code</c> with a closed enum, so no other value may ever be sent.
/// </summary>
internal static class ProblemCodes
{
    /// <summary>422: the request broke a rule.</summary>
    public const string ValidationFailed = "validation_failed";

    /// <summary>401: no valid credentials.</summary>
    public const string Unauthenticated = "unauthenticated";

    /// <summary>403: known, but not permitted.</summary>
    public const string Forbidden = "forbidden";

    /// <summary>404: no such route or resource.</summary>
    public const string NotFound = "not_found";

    /// <summary>409: the trade moved on or is cancelled.</summary>
    public const string Conflict = "conflict";

    /// <summary>429: too many requests from this caller.</summary>
    public const string RateLimited = "rate_limited";

    /// <summary>429: too many failed logins on this account.</summary>
    public const string LockedOut = "locked_out";

    /// <summary>500 or 503: something unexpected.</summary>
    public const string Internal = "internal";

    /// <summary>The media type every error carries, per RFC 9457.</summary>
    public const string ContentType = "application/problem+json";

    /// <summary>The <c>type</c> reference for a code, relative as the Node API sent it, such as <c>/problems/not-found</c>.</summary>
    /// <param name="code">The code.</param>
    /// <returns>The reference.</returns>
    public static string TypeFor(string code) => "/problems/" + code.Replace('_', '-');

    /// <summary>The fixed human-readable title for a code, from the Node API's error handler.</summary>
    /// <param name="code">The code.</param>
    /// <returns>The title.</returns>
    public static string TitleFor(string code) => code switch
    {
        ValidationFailed => "Request validation failed",
        Unauthenticated => "Authentication required",
        Forbidden => "Not permitted",
        NotFound => "Resource not found",
        Conflict => "Conflict",
        RateLimited or LockedOut => "Too many requests",
        _ => "Internal server error",
    };
}
