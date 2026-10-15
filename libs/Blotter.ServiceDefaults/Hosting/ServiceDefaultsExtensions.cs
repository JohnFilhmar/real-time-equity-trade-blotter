using Blotter.ServiceDefaults.Http;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.Extensions.DependencyInjection;
using OpenTelemetry.Metrics;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;
using Serilog;
using Serilog.Events;
using Serilog.Formatting.Compact;
using Serilog.Sinks.OpenTelemetry;

namespace Blotter.ServiceDefaults.Hosting;

/// <summary>The setup every service shares, so logging, telemetry and request handling read the same everywhere.</summary>
public static class ServiceDefaultsExtensions
{
    /// <summary>
    /// Adds JSON logging to stdout, OpenTelemetry traces and metrics with a Prometheus scrape
    /// endpoint, trust in exactly one reverse-proxy hop, and no <c>Server</c> header. Traces, metrics
    /// and logs are also exported over OTLP when <c>OTEL_EXPORTER_OTLP_ENDPOINT</c> is set.
    /// </summary>
    /// <param name="builder">The application builder.</param>
    /// <param name="serviceName">
    /// The service's name, such as <c>Blotter.Trades</c>. It labels every log line, names the
    /// OpenTelemetry resource, and is the name of the service's own <c>Meter</c> and <c>ActivitySource</c>.
    /// </param>
    /// <returns>The builder.</returns>
    /// <exception cref="InvalidOperationException">When <c>LOG_LEVEL</c> is not a known level.</exception>
    public static WebApplicationBuilder AddServiceDefaults(this WebApplicationBuilder builder, string serviceName)
    {
        ArgumentNullException.ThrowIfNull(builder);

        var level = LogLevels.Parse(builder.Configuration["LOG_LEVEL"]);
        var otlpEndpoint = builder.Configuration["OTEL_EXPORTER_OTLP_ENDPOINT"];
        var exportOtlp = !string.IsNullOrWhiteSpace(otlpEndpoint);

        // Framework sources stay at warning or quieter, so a per-request "Request starting" line with a
        // query string, which on the hub carries the access token, never reaches a log.
        var frameworkLevel = level > LogEventLevel.Warning ? level : LogEventLevel.Warning;

        builder.WebHost.ConfigureKestrel(kestrel => kestrel.AddServerHeader = false);

        builder.Services.AddSerilog(logger =>
        {
            logger.MinimumLevel.Is(level)
                .MinimumLevel.Override("Microsoft.AspNetCore", frameworkLevel)
                .MinimumLevel.Override("Microsoft.EntityFrameworkCore", frameworkLevel)
                .MinimumLevel.Override("Grpc", frameworkLevel)
                // Authentication registers Data Protection, which nothing here uses: access tokens
                // are JWTs and the refresh cookie holds one. Its start-up warnings about where keys
                // live would only send an operator looking for a problem that is not there.
                .MinimumLevel.Override("Microsoft.AspNetCore.DataProtection", LogEventLevel.Error)
                .Enrich.FromLogContext()
                .Enrich.WithProperty("service", serviceName)
                .WriteTo.Console(new RenderedCompactJsonFormatter());

            if (exportOtlp)
            {
                logger.WriteTo.OpenTelemetry(options =>
                {
                    options.Endpoint = otlpEndpoint;
                    options.Protocol = OtlpProtocol.Grpc;
                    options.ResourceAttributes = new Dictionary<string, object> { ["service.name"] = serviceName };
                });
            }
        });

        builder.Services.AddOpenTelemetry()
            .ConfigureResource(resource => resource.AddService(serviceName))
            .WithTracing(tracing =>
            {
                tracing.AddSource(serviceName)
                    .AddSource("RabbitMQ.Client.*")
                    .AddAspNetCoreInstrumentation(options =>
                        options.Filter = context => !OperationalEndpoints.IsOperational(context.Request.Path))
                    .AddHttpClientInstrumentation();

                if (exportOtlp)
                {
                    tracing.AddOtlpExporter();
                }
            })
            .WithMetrics(metrics =>
            {
                metrics.AddMeter(serviceName)
                    .AddAspNetCoreInstrumentation()
                    .AddHttpClientInstrumentation()
                    .AddRuntimeInstrumentation()
                    .AddPrometheusExporter();

                if (exportOtlp)
                {
                    metrics.AddOtlpExporter();
                }
            });

        // One trusted hop, the reverse proxy in front, whatever its address. The services publish no
        // port of their own, so nothing else can reach them to forge the header.
        builder.Services.Configure<ForwardedHeadersOptions>(options =>
        {
            options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
            options.ForwardLimit = 1;
            options.KnownIPNetworks.Clear();
            options.KnownProxies.Clear();
        });

        return builder;
    }

    /// <summary>
    /// Adds the request pipeline every service shares: forwarded headers, the correlation id,
    /// security headers, then one structured log line per request. Call it before routing,
    /// authentication and endpoints.
    /// </summary>
    /// <param name="app">The application.</param>
    /// <returns>The application.</returns>
    public static WebApplication UseServiceDefaults(this WebApplication app)
    {
        ArgumentNullException.ThrowIfNull(app);

        app.UseForwardedHeaders();
        app.UseMiddleware<RequestIdMiddleware>();
        app.UseMiddleware<SecurityHeadersMiddleware>();
        app.UseSerilogRequestLogging(options =>
        {
            options.MessageTemplate = "{RequestMethod} {RequestPath} answered {StatusCode} in {Elapsed:0.0} ms";
            options.GetLevel = (context, _, error) =>
                OperationalEndpoints.IsOperational(context.Request.Path) ? LogEventLevel.Verbose
                : error is not null || context.Response.StatusCode >= 500 ? LogEventLevel.Error
                : context.Response.StatusCode >= 400 ? LogEventLevel.Warning
                : LogEventLevel.Information;
        });

        return app;
    }
}
