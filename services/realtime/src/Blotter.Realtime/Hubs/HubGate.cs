using Blotter.Realtime.Telemetry;

namespace Blotter.Realtime.Hubs;

/// <summary>
/// The origin check for the hub, and the counter of refused connections. CORS covers the HTTP
/// negotiate and long-polling requests, but a browser opens a WebSocket to any host, so the origin is
/// checked here for every hub request. A request with no Origin at all is a server-side client or a
/// test, which a browser-origin policy is not about, and is let through to the token check.
/// </summary>
internal static partial class HubGate
{
    /// <summary>Adds the gate in front of everything under the hub path. Call it before authentication.</summary>
    /// <param name="app">The application.</param>
    /// <param name="allowedOrigins">Origins that may open the hub.</param>
    /// <returns>The application.</returns>
    public static WebApplication UseHubGate(this WebApplication app, IReadOnlyCollection<string> allowedOrigins)
    {
        var metrics = app.Services.GetRequiredService<RealtimeMetrics>();
        var logger = app.Services.GetRequiredService<ILoggerFactory>().CreateLogger(typeof(HubGate));

        app.UseWhen(
            context => context.Request.Path.StartsWithSegments(BlotterHub.Path, StringComparison.OrdinalIgnoreCase),
            hub => hub.Use(async (context, next) =>
            {
                var origin = context.Request.Headers.Origin.ToString();
                if (origin.Length > 0 && !allowedOrigins.Contains(origin))
                {
                    metrics.Rejected.Add(1);
                    LogOriginRejected(logger, origin);
                    context.Response.StatusCode = StatusCodes.Status403Forbidden;
                    return;
                }

                await next(context);

                if (context.Response.StatusCode is StatusCodes.Status401Unauthorized or StatusCodes.Status403Forbidden)
                {
                    metrics.Rejected.Add(1);
                }
            }));

        return app;
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Hub connection from origin {Origin} refused")]
    private static partial void LogOriginRejected(ILogger logger, string origin);
}
