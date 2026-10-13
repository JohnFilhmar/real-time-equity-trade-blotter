using Blotter.Gateway.Http;

namespace Blotter.Gateway.Endpoints;

/// <summary>
/// What an unmatched path answers. Under <c>/api/v1</c> the fallback is guarded like every other
/// route there, so an anonymous caller gets 401 for an imaginary path exactly as for a real one and
/// cannot enumerate the API. Everywhere else it is a 404 problem rather than a bare 404.
/// </summary>
internal static class FallbackEndpoints
{
    /// <summary>Maps both fallbacks.</summary>
    /// <param name="app">The application.</param>
    /// <returns>The application.</returns>
    public static WebApplication MapFallbacks(this WebApplication app)
    {
        app.MapFallback("/api/v1/{**path}", NotFound);

        // Not the default fallback, whose pattern skips paths that look like files and would leave
        // /favicon.ico to the authentication fallback policy, a 401 where Express sent a 404.
        app.MapFallback("{**path}", NotFound).AllowAnonymous();
        return app;
    }

    private static IResult NotFound(HttpContext http) =>
        throw ApiProblem.NotFound($"No route matches {http.Request.Method} {http.Request.Path}");
}
