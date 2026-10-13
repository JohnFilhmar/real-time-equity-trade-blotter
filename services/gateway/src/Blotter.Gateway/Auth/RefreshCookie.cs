using Blotter.Gateway.Settings;

namespace Blotter.Gateway.Auth;

/// <summary>
/// The refresh token's cookie: httpOnly so no script on the page can read it, SameSite=Lax, and
/// scoped to the auth routes so the long-lived credential is not attached to every trade request.
/// Secure whenever the environment is Production or <c>COOKIE_SECURE</c> is set.
/// </summary>
internal static class RefreshCookie
{
    /// <summary>The cookie name, unchanged from the Node API.</summary>
    public const string Name = "blotter_refresh";

    /// <summary>The path the browser sends it on.</summary>
    public const string Path = "/api/v1/auth";

    /// <summary>Sets the cookie on the response.</summary>
    /// <param name="response">The response.</param>
    /// <param name="token">The refresh token.</param>
    /// <param name="settings">Its lifetime and whether it must be Secure.</param>
    /// <param name="production">Whether the gateway runs in Production.</param>
    public static void Set(HttpResponse response, string token, GatewaySettings settings, bool production) =>
        response.Cookies.Append(Name, token, new CookieOptions
        {
            HttpOnly = true,
            Secure = settings.CookieSecure || production,
            SameSite = SameSiteMode.Lax,
            Path = Path,
            MaxAge = TimeSpan.FromSeconds(settings.RefreshTokenTtlSeconds),
            Expires = DateTimeOffset.UtcNow.AddSeconds(settings.RefreshTokenTtlSeconds),
        });

    /// <summary>Clears the cookie, on logout.</summary>
    /// <param name="response">The response.</param>
    public static void Clear(HttpResponse response) => response.Cookies.Delete(Name, new CookieOptions { Path = Path });

    /// <summary>Reads the cookie from a request.</summary>
    /// <param name="request">The request.</param>
    /// <returns>The token, or null when there is none.</returns>
    public static string? Read(HttpRequest request) => request.Cookies.TryGetValue(Name, out var token) ? token : null;
}
