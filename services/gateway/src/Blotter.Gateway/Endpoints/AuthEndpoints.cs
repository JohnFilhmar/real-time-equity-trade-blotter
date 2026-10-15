using Blotter.Gateway.Auth;
using Blotter.Gateway.Http;
using Blotter.Gateway.Settings;
using Blotter.Gateway.Validation;
using Blotter.ServiceDefaults.Auth;

namespace Blotter.Gateway.Endpoints;

/// <summary>
/// Sign-in and the session lifecycle. Login and refresh are the only anonymous routes under
/// <c>/api/v1</c>, both on the strict per-address tier. Logout sits behind the guard, so a caller
/// holding only somebody's cookie cannot end their session.
/// </summary>
internal static class AuthEndpoints
{
    /// <summary>Maps the four auth routes.</summary>
    /// <param name="api">The <c>/api/v1</c> group.</param>
    /// <returns>The group.</returns>
    public static RouteGroupBuilder MapAuthEndpoints(this RouteGroupBuilder api)
    {
        api.MapPost("/auth/login", Login).AllowAnonymous().WithMetadata(new RateLimitTierAttribute(RateLimitTier.Auth));
        api.MapPost("/auth/refresh", Refresh).AllowAnonymous().WithMetadata(new RateLimitTierAttribute(RateLimitTier.Auth));
        api.MapGet("/auth/me", Me);
        api.MapPost("/auth/logout", Logout);
        return api;
    }

    private static async Task<IResult> Login(
        HttpContext http,
        AuthService auth,
        LoginValidator validator,
        GatewaySettings settings,
        IHostEnvironment environment)
    {
        var body = await JsonBodies.ReadAsync(http.Request);
        validator.Ensure(body);

        var (username, password) = RequestMapping.ToLogin(body);
        var result = await auth.LoginAsync(username, password, http.RequestAborted);

        RefreshCookie.Set(http.Response, result.RefreshToken, settings, environment.IsProduction());
        return Results.Json(result.Session);
    }

    private static async Task<IResult> Refresh(HttpContext http, AuthService auth, GatewaySettings settings, IHostEnvironment environment)
    {
        var result = await auth.RefreshAsync(RefreshCookie.Read(http.Request), http.RequestAborted);

        RefreshCookie.Set(http.Response, result.RefreshToken, settings, environment.IsProduction());
        return Results.Json(result.Session);
    }

    private static async Task<IResult> Me(HttpContext http, AuthService auth)
    {
        var claims = AccessClaims.From(http.User) ?? throw ApiProblem.Unauthenticated();
        return Results.Json(await auth.CurrentUserAsync(claims.UserId, http.RequestAborted));
    }

    private static async Task<IResult> Logout(HttpContext http, AuthService auth)
    {
        await auth.LogoutAsync(RefreshCookie.Read(http.Request));
        RefreshCookie.Clear(http.Response);
        return Results.NoContent();
    }
}
