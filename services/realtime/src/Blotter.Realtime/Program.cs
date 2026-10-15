using Blotter.Contracts.Json;
using Blotter.Contracts.Reference;
using Blotter.Realtime.Broadcasting;
using Blotter.Realtime.Hubs;
using Blotter.Realtime.Marks;
using Blotter.Realtime.Messaging;
using Blotter.Realtime.Settings;
using Blotter.Realtime.Telemetry;
using Blotter.ServiceDefaults.Auth;
using Blotter.ServiceDefaults.Configuration;
using Blotter.ServiceDefaults.Hosting;
using Microsoft.AspNetCore.SignalR.StackExchangeRedis;
using StackExchange.Redis;

if (args is ["healthcheck", ..])
{
    return await ContainerCommands.CheckReadyAsync(Environment.GetEnvironmentVariable("HTTP_PORT"));
}

var builder = WebApplication.CreateBuilder(args);
builder.AddServiceDefaults(RealtimeMetrics.MeterName);

var settings = SettingsLoader.Load<RealtimeSettings, RealtimeSettingsValidator>(builder.Configuration);
var origins = SettingRules.ParseOrigins(settings.CorsOrigins);

builder.WebHost.ConfigureKestrel(kestrel => kestrel.ListenAnyIP(settings.HttpPort));

// One connection for everything Redis does here: the backplane, the sequence, the marks and the
// lease. It keeps retrying in the background, so the service starts even if Redis is a moment late.
// The container owns it, so it is disposed after the backplane that unsubscribes through it.
var redisOptions = ConfigurationOptions.Parse(settings.RedisConnection);
redisOptions.AbortOnConnectFail = false;

builder.Services.AddSingleton(settings);
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<IConnectionMultiplexer>(_ => ConnectionMultiplexer.Connect(redisOptions));
builder.Services.AddSingleton<RealtimeMetrics>();
builder.Services.AddSingleton<MarkStore>();
builder.Services.AddSingleton<TradeBroadcaster>();
builder.Services.AddSingleton<TradeChangeConsumer>();
builder.Services.AddHostedService(services => services.GetRequiredService<TradeChangeConsumer>());

if (settings.MarkFeedEnabled)
{
    builder.Services.AddHostedService<MarkFeed>();
}

builder.Services
    .AddSignalR()
    .AddJsonProtocol(options => BlotterJson.Configure(options.PayloadSerializerOptions))
    .AddStackExchangeRedis(options => options.Configuration.ChannelPrefix = RedisChannel.Literal("blotter"));
builder.Services
    .AddOptions<RedisOptions>()
    .Configure<IConnectionMultiplexer>((options, redis) => options.ConnectionFactory = _ => Task.FromResult(redis));

builder.Services.AddCors(cors => cors.AddDefaultPolicy(policy => policy
    .WithOrigins(origins)
    .AllowCredentials()
    .AllowAnyHeader()
    .WithMethods("GET", "POST")));

// Browsers cannot set headers on a WebSocket, so the SignalR client sends the access token as the
// access_token query value on the hub path only. Everywhere else it must be a bearer header.
builder.Services.AddAccessTokenAuthentication(settings.JwtAccessSecret, options =>
    options.Events.OnMessageReceived = context =>
    {
        var token = context.Request.Query["access_token"].ToString();
        if (token.Length > 0 && context.HttpContext.Request.Path.StartsWithSegments(BlotterHub.Path, StringComparison.OrdinalIgnoreCase))
        {
            context.Token = token;
        }

        return Task.CompletedTask;
    });
builder.Services.AddPermissionAuthorization();
builder.Services.ConfigureHttpJsonOptions(options => BlotterJson.Configure(options.SerializerOptions));

var app = builder.Build();

app.UseServiceDefaults();
app.UseHubGate(origins);
app.UseCors();
app.UseAuthentication();
app.UseAuthorization();

app.MapHub<BlotterHub>(BlotterHub.Path).RequireAuthorization(Permissions.TradeRead);
app.MapOperationalEndpoints(
    new ReadinessProbe("redis", (services, _) => services.GetRequiredService<IConnectionMultiplexer>().GetDatabase().PingAsync()),
    new ReadinessProbe("broker", (services, _) => services.GetRequiredService<TradeChangeConsumer>().IsConnected
        ? Task.CompletedTask
        : throw new InvalidOperationException("The broker consumer is not connected")));

await app.RunAsync();
return 0;

/// <summary>The realtime service's entry point, public so the integration tests can host it in memory.</summary>
public partial class Program;
