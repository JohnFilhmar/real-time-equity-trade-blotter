using Blotter.Contracts.Grpc;
using Blotter.Contracts.Json;
using Blotter.ServiceDefaults.Auth;
using Blotter.ServiceDefaults.Configuration;
using Blotter.ServiceDefaults.Hosting;
using Blotter.Trades.Api;
using Blotter.Trades.Api.Validation;
using Blotter.Trades.Data;
using Blotter.Trades.Domain;
using Blotter.Trades.Outbox;
using Blotter.Trades.Repositories;
using Blotter.Trades.Services;
using Blotter.Trades.Settings;
using Blotter.Trades.Simulation;
using FluentValidation;
using Microsoft.AspNetCore.Server.Kestrel.Core;
using Microsoft.EntityFrameworkCore;

// `healthcheck` is the container's probe and `migrate` is the one-shot migration job. Both run the
// same image as the service, so the migration that ships is always the one the code was built with.
if (args is ["healthcheck", ..])
{
    return await ContainerCommands.CheckReadyAsync(Environment.GetEnvironmentVariable("HTTP_PORT"));
}

var builder = WebApplication.CreateBuilder(args);
builder.AddServiceDefaults("Blotter.Trades");

var settings = SettingsLoader.Load<TradesSettings, TradesSettingsValidator>(builder.Configuration);

// Two listeners: HTTP/1.1 for the probes and the scraper, HTTP/2 without TLS for gRPC, which is only
// reachable on the internal network.
builder.WebHost.ConfigureKestrel(kestrel =>
{
    kestrel.ListenAnyIP(settings.HttpPort, listen => listen.Protocols = HttpProtocols.Http1);
    kestrel.ListenAnyIP(settings.GrpcPort, listen => listen.Protocols = HttpProtocols.Http2);
});

builder.Services.AddSingleton(settings);
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddDbContext<TradesDbContext>(options => options.UseSqlServer(settings.DatabaseConnection));
builder.Services.AddScoped<TradeRepository>();
builder.Services.AddScoped<TradeService>();
builder.Services.AddScoped<TradeSeeder>();
builder.Services.AddSingleton(new NotionalLimits(settings.MaxNotionalUsd, settings.MaxNotionalGbx));
builder.Services.AddSingleton<OutboxSignal>();

builder.Services.AddSingleton<IValidator<CreateTradeRequest>, CreateTradeRequestValidator>();
builder.Services.AddSingleton<IValidator<AmendTradeRequest>, AmendTradeRequestValidator>();
builder.Services.AddSingleton<IValidator<CancelTradeRequest>, CancelTradeRequestValidator>();
builder.Services.AddSingleton<IValidator<TradeRef>, TradeRefValidator>();
builder.Services.AddSingleton<IValidator<ListTradesRequest>, ListTradesRequestValidator>();
builder.Services.AddSingleton<IValidator<ListEventsRequest>, ListEventsRequestValidator>();

if (settings.OutboxDispatchEnabled)
{
    builder.Services.AddSingleton<RabbitPublisher>();
    builder.Services.AddHostedService<OutboxDispatcher>();
}

if (settings.LiveFeedEnabled)
{
    builder.Services.AddHostedService(services => new LiveFeed(
        services.GetRequiredService<IServiceScopeFactory>(),
        settings,
        services.GetRequiredService<TimeProvider>(),
        Random.Shared,
        services.GetRequiredService<ILogger<LiveFeed>>()));
}

builder.Services.AddGrpc(options => options.Interceptors.Add<TradeRuleInterceptor>());
builder.Services.ConfigureHttpJsonOptions(options => BlotterJson.Configure(options.SerializerOptions));
builder.Services.AddAccessTokenAuthentication(settings.JwtAccessSecret);
builder.Services.AddPermissionAuthorization();

var app = builder.Build();

if (args is ["migrate", ..])
{
    await using var scope = app.Services.CreateAsyncScope();
    await scope.ServiceProvider.GetRequiredService<TradesDbContext>().Database.MigrateAsync();
    StartupLog.Migrated(app.Logger);
    return 0;
}

if (settings.SeedOnStartup)
{
    await using var scope = app.Services.CreateAsyncScope();
    var inserted = await scope.ServiceProvider.GetRequiredService<TradeSeeder>().SeedIfEmptyAsync(settings.SeedTradeCount, CancellationToken.None);
    StartupLog.Seeded(app.Logger, inserted);
}

app.UseServiceDefaults();
app.UseAuthentication();
app.UseAuthorization();

app.MapGrpcService<TradesGrpcService>();
app.MapOperationalEndpoints(new ReadinessProbe(
    "database",
    (services, cancellationToken) => services.GetRequiredService<TradesDbContext>().Database.ExecuteSqlRawAsync("SELECT 1", cancellationToken)));

await app.RunAsync();
return 0;

/// <summary>The trades service's entry point, public so the integration tests can host it in memory.</summary>
public partial class Program;

/// <summary>Log lines written while the service starts.</summary>
internal static partial class StartupLog
{
    /// <summary>Records that the migration job finished.</summary>
    /// <param name="logger">The application logger.</param>
    [LoggerMessage(Level = LogLevel.Information, Message = "Trades database migrated")]
    public static partial void Migrated(ILogger logger);

    /// <summary>Records how many trades the seed inserted, zero when the database already held some.</summary>
    /// <param name="logger">The application logger.</param>
    /// <param name="inserted">Rows inserted.</param>
    [LoggerMessage(Level = LogLevel.Information, Message = "Seeded {Inserted} trades")]
    public static partial void Seeded(ILogger logger, int inserted);
}
