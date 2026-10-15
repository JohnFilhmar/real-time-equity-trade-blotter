using Blotter.Contracts.Grpc;
using Blotter.Contracts.Json;
using Blotter.Gateway.Auth;
using Blotter.Gateway.Data;
using Blotter.Gateway.Endpoints;
using Blotter.Gateway.Http;
using Blotter.Gateway.Settings;
using Blotter.Gateway.Validation;
using Blotter.ServiceDefaults.Auth;
using Blotter.ServiceDefaults.Configuration;
using Blotter.ServiceDefaults.Hosting;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using StackExchange.Redis;

// `healthcheck` is the container's probe and `migrate` is the one-shot migration job, as in the
// trades service.
if (args is ["healthcheck", ..])
{
    return await ContainerCommands.CheckReadyAsync(Environment.GetEnvironmentVariable("HTTP_PORT"));
}

var builder = WebApplication.CreateBuilder(args);
builder.AddServiceDefaults("Blotter.Gateway");

var settings = SettingsLoader.Load<GatewaySettings, GatewaySettingsValidator>(builder.Configuration);
var origins = SettingRules.ParseOrigins(settings.CorsOrigins);

builder.WebHost.ConfigureKestrel(kestrel =>
{
    kestrel.ListenAnyIP(settings.HttpPort);
    kestrel.Limits.MaxRequestBodySize = JsonBodies.MaxBytes;
});

// Sessions, lockouts and rate-limit windows all live in Redis. The connection keeps retrying in the
// background, so the gateway starts even if Redis is a moment late.
var redisOptions = ConfigurationOptions.Parse(settings.RedisConnection);
redisOptions.AbortOnConnectFail = false;

builder.Services.AddSingleton(settings);
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<IConnectionMultiplexer>(_ => ConnectionMultiplexer.Connect(redisOptions));
builder.Services.AddDbContext<IdentityDbContext>(options => options.UseSqlServer(settings.DatabaseConnection));

builder.Services.AddSingleton<PasswordHasher>();
builder.Services.AddSingleton<TokenService>();
builder.Services.AddSingleton<RefreshStore>();
builder.Services.AddSingleton<LoginAttempts>();
builder.Services.AddScoped<AuthService>();
builder.Services.AddScoped<UserSeeder>();

builder.Services.AddSingleton<LoginValidator>();
builder.Services.AddSingleton<CreateTradeValidator>();
builder.Services.AddSingleton<AmendTradeValidator>();
builder.Services.AddSingleton<CancelTradeValidator>();
builder.Services.AddSingleton<TradeQueryValidator>();
builder.Services.AddSingleton<EventQueryValidator>();
builder.Services.AddSingleton<TradeIdValidator>();

builder.Services.AddHttpContextAccessor();
builder.Services.AddSingleton<ForwardCallerInterceptor>();
builder.Services
    .AddGrpcClient<Trades.TradesClient>(options => options.Address = new Uri(settings.TradesGrpcUrl))
    .AddInterceptor<ForwardCallerInterceptor>();

builder.Services.AddCors(cors => cors.AddDefaultPolicy(policy => policy
    .WithOrigins(origins)
    .AllowCredentials()
    .AllowAnyHeader()
    .WithMethods("GET", "POST", "PATCH", "DELETE", "OPTIONS")));

// A missing token and a bad one get the Node API's two wordings, as a problem document rather than
// the bare 401 and WWW-Authenticate header the handler would send.
builder.Services.AddAccessTokenAuthentication(settings.JwtAccessSecret, options =>
    options.Events.OnChallenge = context =>
    {
        context.HandleResponse();
        return ProblemWriter.WriteAsync(context.HttpContext, ApiProblem.Unauthenticated(
            context.AuthenticateFailure is null ? "Authentication is required" : "The access token is not valid"));
    });
builder.Services.AddPermissionAuthorization();

builder.Services.AddSingleton<TieredRateLimiter>();
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.OnRejected = (context, _) => new ValueTask(ProblemWriter.WriteAsync(
        context.HttpContext,
        StatusCodes.Status429TooManyRequests,
        ProblemCodes.RateLimited,
        "Too many requests. Try again shortly.",
        retryAfterSeconds: TieredRateLimiter.SecondsUntilReset(context.Lease)));
});
builder.Services
    .AddOptions<RateLimiterOptions>()
    .Configure<TieredRateLimiter>((options, limiter) => options.GlobalLimiter = limiter);

builder.Services.ConfigureHttpJsonOptions(options => BlotterJson.Configure(options.SerializerOptions));

var app = builder.Build();

if (args is ["migrate", ..])
{
    await using var scope = app.Services.CreateAsyncScope();
    await scope.ServiceProvider.GetRequiredService<IdentityDbContext>().Database.MigrateAsync();
    StartupLog.Migrated(app.Logger);
    return 0;
}

if (settings.SeedOnStartup)
{
    await using var scope = app.Services.CreateAsyncScope();
    await scope.ServiceProvider.GetRequiredService<UserSeeder>().SeedIfEmptyAsync(CancellationToken.None);
}

// The order is the security model, as it was in the Node API's app.ts: every request gets its
// correlation id and headers first, then errors become problems, then CORS answers preflights,
// then the guard, and the rate limits last so they can count by user rather than by address.
app.UseServiceDefaults();
app.UseMiddleware<ProblemMiddleware>();
app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();

app.MapGroup("/api/v1").MapAuthEndpoints().MapTradeEndpoints();
app.MapOperationalEndpoints(new ReadinessProbe(
    "database",
    (services, cancellationToken) => services.GetRequiredService<IdentityDbContext>().Database.ExecuteSqlRawAsync("SELECT 1", cancellationToken)));
app.MapFallbacks();

await app.RunAsync();
return 0;

/// <summary>The gateway's entry point, public so the integration tests can host it in memory.</summary>
public partial class Program;

/// <summary>Log lines written while the gateway starts.</summary>
internal static partial class StartupLog
{
    /// <summary>Records that the migration job finished.</summary>
    /// <param name="logger">The application logger.</param>
    [LoggerMessage(Level = LogLevel.Information, Message = "Identity database migrated")]
    public static partial void Migrated(ILogger logger);
}
