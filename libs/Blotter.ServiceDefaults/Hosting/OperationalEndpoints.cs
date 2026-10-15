using System.Diagnostics;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Blotter.ServiceDefaults.Hosting;

/// <summary>
/// The three endpoints a container needs and a blotter client never calls: liveness, readiness and
/// metrics. They sit outside <c>/api/v1</c> and are always anonymous.
/// </summary>
public static partial class OperationalEndpoints
{
    private static readonly long StartedAt = Stopwatch.GetTimestamp();

    private static readonly TimeSpan ProbeTimeout = TimeSpan.FromSeconds(3);

    /// <summary>Whether a path is one of the operational endpoints, which are kept out of traces and request logs.</summary>
    /// <param name="path">The request path.</param>
    /// <returns>True for <c>/health</c>, <c>/ready</c> and <c>/metrics</c>.</returns>
    public static bool IsOperational(PathString path) =>
        path.Equals("/health", StringComparison.OrdinalIgnoreCase)
        || path.Equals("/ready", StringComparison.OrdinalIgnoreCase)
        || path.Equals("/metrics", StringComparison.OrdinalIgnoreCase);

    /// <summary>
    /// Maps <c>GET /health</c>, which answers whether the process is up, <c>GET /ready</c>, which
    /// answers whether it can serve traffic, and <c>GET /metrics</c> in the Prometheus text format.
    /// The bodies keep the Node API's shapes: <c>{"status":"ok","uptime_seconds":12}</c>, then
    /// <c>{"status":"ready","database":"up"}</c> or a 503 with <c>not_ready</c> and <c>down</c>.
    /// </summary>
    /// <param name="app">The application.</param>
    /// <param name="probes">The dependencies readiness depends on, reported in this order.</param>
    /// <returns>The application.</returns>
    public static WebApplication MapOperationalEndpoints(this WebApplication app, params ReadinessProbe[] probes)
    {
        ArgumentNullException.ThrowIfNull(app);

        app.MapGet("/health", () => Results.Json(new Dictionary<string, object>
        {
            ["status"] = "ok",
            ["uptime_seconds"] = (long)Math.Round(Stopwatch.GetElapsedTime(StartedAt).TotalSeconds),
        })).AllowAnonymous();

        app.MapGet("/ready", (HttpContext context, ILoggerFactory loggers) => Ready(context, loggers, probes)).AllowAnonymous();

        app.MapPrometheusScrapingEndpoint().AllowAnonymous();

        return app;
    }

    private static async Task<IResult> Ready(HttpContext context, ILoggerFactory loggers, ReadinessProbe[] probes)
    {
        var logger = loggers.CreateLogger(typeof(OperationalEndpoints));
        var report = new Dictionary<string, string> { ["status"] = "ready" };
        var ready = true;

        foreach (var probe in probes)
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(context.RequestAborted);
            timeout.CancelAfter(ProbeTimeout);

            try
            {
                await probe.Check(context.RequestServices, timeout.Token);
                report[probe.Name] = "up";
            }
#pragma warning disable CA1031 // Any failure means "down"; the reason is logged, never returned.
            catch (Exception error)
#pragma warning restore CA1031
            {
                ready = false;
                report[probe.Name] = "down";
                LogProbeFailed(logger, error, probe.Name);
            }
        }

        if (!ready)
        {
            report["status"] = "not_ready";
        }

        return Results.Json(report, statusCode: ready ? StatusCodes.Status200OK : StatusCodes.Status503ServiceUnavailable);
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Readiness probe {Probe} failed")]
    private static partial void LogProbeFailed(ILogger logger, Exception error, string probe);
}
