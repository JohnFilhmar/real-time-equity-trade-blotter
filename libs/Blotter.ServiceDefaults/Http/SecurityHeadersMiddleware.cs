using Microsoft.AspNetCore.Http;

namespace Blotter.ServiceDefaults.Http;

/// <summary>
/// Sets the headers helmet set on the Node API, tightened for services that only ever answer JSON:
/// nothing they return may be framed, sniffed, or allowed to load anything at all.
/// </summary>
/// <param name="next">The rest of the pipeline.</param>
internal sealed class SecurityHeadersMiddleware(RequestDelegate next)
{
    private static readonly KeyValuePair<string, string>[] Headers =
    [
        new("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"),
        new("Cross-Origin-Opener-Policy", "same-origin"),
        new("Cross-Origin-Resource-Policy", "same-origin"),
        new("Origin-Agent-Cluster", "?1"),
        new("Referrer-Policy", "no-referrer"),
        new("Strict-Transport-Security", "max-age=31536000; includeSubDomains"),
        new("X-Content-Type-Options", "nosniff"),
        new("X-DNS-Prefetch-Control", "off"),
        new("X-Download-Options", "noopen"),
        new("X-Frame-Options", "DENY"),
        new("X-Permitted-Cross-Domain-Policies", "none"),
        new("X-XSS-Protection", "0"),
    ];

    /// <summary>Runs the middleware.</summary>
    /// <param name="context">The request.</param>
    /// <returns>A task that completes with the request.</returns>
    public Task InvokeAsync(HttpContext context)
    {
        context.Response.OnStarting(() =>
        {
            foreach (var (name, value) in Headers)
            {
                context.Response.Headers[name] = value;
            }

            return Task.CompletedTask;
        });

        return next(context);
    }
}
