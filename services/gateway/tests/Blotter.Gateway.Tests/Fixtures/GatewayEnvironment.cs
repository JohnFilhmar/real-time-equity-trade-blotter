using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Blotter.Contracts.Wire;
using Blotter.Gateway.Data;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Blotter.Gateway.Tests.Fixtures;

/// <summary>
/// One running system: its own Redis database and its own identity and trades databases, the real
/// trades service in memory, and the real gateway in front of it, seeded with the four demo accounts.
/// Nothing is mocked; a request goes through every middleware, the gRPC hop and SQL Server. Rate
/// limits are raised out of the way unless a subclass lowers them. Use it as a class fixture when
/// tests can share state, or derive the test class from it for a fresh system per test.
/// </summary>
/// <param name="sql">The shared SQL Server.</param>
/// <param name="redis">The shared Redis.</param>
public class GatewayEnvironment(SqlServerFixture sql, RedisFixture redis) : IAsyncLifetime
{
    /// <summary>The access-token secret both services are configured with.</summary>
    public const string AccessSecret = "test-access-secret-0123456789abcdefghij";

    /// <summary>The refresh-token secret only the gateway holds.</summary>
    public const string RefreshSecret = "test-refresh-secret-0123456789abcdefghij";

    /// <summary>The demo accounts' password, and the password of every account a test adds.</summary>
    public const string Password = "FusionDemo!2026";

    /// <summary>The browser origin the gateway allows.</summary>
    public const string AllowedOrigin = "http://localhost:3000";

    private readonly ConcurrentDictionary<string, string> tokens = new(StringComparer.Ordinal);
    private RedisLease? redisLease;
    private TradesFactory? trades;
    private GatewayFactory? gateway;

    /// <summary>The identity database, as the system administrator.</summary>
    public string IdentityConnection { get; private set; } = string.Empty;

    /// <summary>The trades database, as the system administrator.</summary>
    public string TradesConnection { get; private set; } = string.Empty;

    /// <summary>The Redis database the gateway uses.</summary>
    public string RedisConnection => redisLease?.ConnectionString ?? throw new InvalidOperationException("The environment has not started");

    /// <summary>The running gateway.</summary>
    public GatewayFactory Gateway => gateway ?? throw new InvalidOperationException("The environment has not started");

    /// <summary>Settings this environment changes from the defaults, applied last.</summary>
    protected virtual IReadOnlyDictionary<string, string> SettingOverrides { get; } = new Dictionary<string, string>();

    /// <summary>The clock the trades service stamps writes with, or null for the system clock.</summary>
    protected virtual TimeProvider? TradesClock => null;

    /// <summary>A client with no cookie jar and no redirects, so every test sets exactly what it sends.</summary>
    /// <returns>The client.</returns>
    public HttpClient Client() => Gateway.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false, HandleCookies = false });

    /// <summary>Sends one request.</summary>
    /// <param name="method">The method.</param>
    /// <param name="path">The path and query.</param>
    /// <param name="token">An access token for the bearer header, or null for none.</param>
    /// <param name="json">Raw JSON text for the body, sent as application/json, or null for no body.</param>
    /// <param name="headers">Any further headers, such as a cookie or a forwarded address.</param>
    /// <returns>The response.</returns>
    public async Task<HttpResponseMessage> SendAsync(
        HttpMethod method,
        string path,
        string? token = null,
        string? json = null,
        IReadOnlyDictionary<string, string>? headers = null)
    {
        using var request = new HttpRequestMessage(method, path);
        if (token is not null)
        {
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        }

        if (json is not null)
        {
            request.Content = new StringContent(json, Encoding.UTF8, "application/json");
        }

        foreach (var (name, value) in headers ?? new Dictionary<string, string>())
        {
            request.Headers.TryAddWithoutValidation(name, value);
        }

        using var client = Client();
        return await client.SendAsync(request);
    }

    /// <summary>Signs in through the real login route and returns the access token, once per account.</summary>
    /// <param name="username">A seeded account, or one a test added.</param>
    /// <returns>The access token.</returns>
    public async Task<string> TokenAsync(string username)
    {
        if (tokens.TryGetValue(username, out var cached))
        {
            return cached;
        }

        using var response = await SendAsync(HttpMethod.Post, "/api/v1/auth/login", json: Login(username, Password));
        response.EnsureSuccessStatusCode();
        return tokens[username] = (await response.ReadAsync()).Text("accessToken");
    }

    /// <summary>A login body.</summary>
    /// <param name="username">The username.</param>
    /// <param name="password">The password.</param>
    /// <returns>The JSON text.</returns>
    public static string Login(string username, string password) =>
        JsonSerializer.Serialize(new Dictionary<string, string> { ["username"] = username, ["password"] = password });

    /// <summary>Books a trade through the API and returns it, failing the test unless it was created.</summary>
    /// <param name="token">The caller's access token.</param>
    /// <param name="ticket">The ticket, by default <see cref="Payloads.Ticket"/>.</param>
    /// <returns>The booked trade.</returns>
    public async Task<JsonElement> BookAsync(string token, string? ticket = null)
    {
        using var response = await SendAsync(HttpMethod.Post, "/api/v1/trades", token, ticket ?? Payloads.Ticket());
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return await response.ReadAsync();
    }

    /// <summary>
    /// What the realtime service would broadcast for everything in the outbox so far, in order. It maps
    /// a created change to trade.created then position.updated, and an amendment or cancellation to
    /// its own event, then trade_event.recorded, then position.updated; the realtime suite tests that
    /// mapping, so here it stands in for the Node API's in-process broadcaster.
    /// </summary>
    /// <returns>The event names.</returns>
    public async Task<List<string>> BroadcastsAsync()
    {
        await using var connection = new SqlConnection(TradesConnection);
        await connection.OpenAsync();
        await using var command = new SqlCommand("SELECT JSON_VALUE(payload, '$.kind') FROM outbox_message ORDER BY id", connection);
        await using var reader = await command.ExecuteReaderAsync();

        var names = new List<string>();
        while (await reader.ReadAsync())
        {
            var kind = reader.GetString(0);
            names.AddRange(kind == "created"
                ? ["trade.created", "position.updated"]
                : [$"trade.{kind}", "trade_event.recorded", "position.updated"]);
        }

        return names;
    }

    /// <summary>Adds an account directly to the identity database, for tests that must not disturb the demo accounts.</summary>
    /// <param name="username">The new account's username.</param>
    /// <param name="role">Its role.</param>
    /// <param name="traderCode">Its desk code, by default the username upper-cased.</param>
    /// <param name="passwordHash">Its stored hash, by default <see cref="Password"/> hashed by the gateway's own hasher.</param>
    /// <returns>The new account's id.</returns>
    public async Task<Guid> AddUserAsync(string username, Role role = Role.Trader, string? traderCode = null, string? passwordHash = null)
    {
        await using var scope = Gateway.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<IdentityDbContext>();
        var now = DateTimeOffset.UtcNow;
        var user = new UserRow
        {
            Id = Guid.CreateVersion7(now),
            Username = username,
            PasswordHash = passwordHash ?? scope.ServiceProvider.GetRequiredService<Auth.PasswordHasher>().Hash(Password),
            DisplayName = username,
            TraderCode = traderCode ?? username.ToUpperInvariant(),
            Role = role,
            CreatedAt = now,
            UpdatedAt = now,
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();
        return user.Id;
    }

    /// <summary>A username no other test uses, short enough to double as a desk code.</summary>
    /// <returns>The username.</returns>
    public static string UniqueUsername() => $"u_{Guid.NewGuid():N}"[..20];

    /// <summary>Reads one account straight from the identity database.</summary>
    /// <param name="username">The username.</param>
    /// <returns>The row, or null.</returns>
    internal async Task<UserRow?> FindUserAsync(string username)
    {
        await using var scope = Gateway.Services.CreateAsyncScope();
        return await scope.ServiceProvider.GetRequiredService<IdentityDbContext>().Users.AsNoTracking().SingleOrDefaultAsync(row => row.Username == username);
    }

    /// <summary>Replaces services after the gateway's own registrations.</summary>
    /// <param name="services">The gateway's services.</param>
    protected virtual void ConfigureServices(IServiceCollection services)
    {
    }

    /// <inheritdoc />
    public async ValueTask InitializeAsync()
    {
        var identity = sql.CreateIdentityDatabaseAsync();
        var tradesDatabase = sql.CreateTradesDatabaseAsync();
        var lease = redis.LeaseAsync();
        await Task.WhenAll(identity, tradesDatabase, lease);
        IdentityConnection = await identity;
        TradesConnection = await tradesDatabase;
        redisLease = await lease;

        var settings = new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["DATABASE_CONNECTION"] = IdentityConnection,
            ["REDIS_CONNECTION"] = RedisConnection,
            ["TRADES_GRPC_URL"] = "http://trades.test:8081",
            ["JWT_ACCESS_SECRET"] = AccessSecret,
            ["JWT_REFRESH_SECRET"] = RefreshSecret,
            ["BCRYPT_ROUNDS"] = "10",
            ["CORS_ORIGINS"] = AllowedOrigin,
            ["AUTH_RATE_LIMIT"] = "10000",
            ["READ_RATE_LIMIT"] = "10000",
            ["WRITE_RATE_LIMIT"] = "10000",
            ["SEED_ON_STARTUP"] = "true",
            ["SEED_USER_PASSWORD"] = Password,
            ["LOG_LEVEL"] = "warn",
        };

        foreach (var (key, value) in SettingOverrides)
        {
            settings[key] = value;
        }

        trades = new TradesFactory(TradesConnection, TradesClock);
        gateway = new GatewayFactory(settings, trades, ConfigureServices);
        _ = gateway.Server;
    }

    /// <inheritdoc />
    public async ValueTask DisposeAsync()
    {
        if (gateway is not null)
        {
            await gateway.DisposeAsync();
        }

        if (trades is not null)
        {
            await trades.DisposeAsync();
        }

        redisLease?.Dispose();
        GC.SuppressFinalize(this);
    }
}
