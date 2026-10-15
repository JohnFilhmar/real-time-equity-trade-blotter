using Microsoft.Extensions.Configuration;

namespace Blotter.Gateway.Settings;

/// <summary>
/// Everything the gateway reads from its environment, validated once at boot. Names and defaults
/// match the Node API's <c>env.ts</c> wherever the setting existed there.
/// </summary>
internal sealed class GatewaySettings
{
    /// <summary>SQL Server connection string for the identity database.</summary>
    [ConfigurationKeyName("DATABASE_CONNECTION")]
    public string DatabaseConnection { get; set; } = string.Empty;

    /// <summary>StackExchange.Redis configuration. Holds session families, lockout counters and rate-limit windows.</summary>
    [ConfigurationKeyName("REDIS_CONNECTION")]
    public string RedisConnection { get; set; } = string.Empty;

    /// <summary>Address of the trades service's gRPC listener, such as <c>http://trades:8081</c>.</summary>
    [ConfigurationKeyName("TRADES_GRPC_URL")]
    public string TradesGrpcUrl { get; set; } = string.Empty;

    /// <summary>Signs access tokens. The trades and realtime services verify with the same secret.</summary>
    [ConfigurationKeyName("JWT_ACCESS_SECRET")]
    public string JwtAccessSecret { get; set; } = string.Empty;

    /// <summary>Signs refresh tokens. Only the gateway ever holds it.</summary>
    [ConfigurationKeyName("JWT_REFRESH_SECRET")]
    public string JwtRefreshSecret { get; set; } = string.Empty;

    /// <summary>Access-token lifetime in seconds, at most an hour.</summary>
    [ConfigurationKeyName("ACCESS_TOKEN_TTL_SECONDS")]
    public int AccessTokenTtlSeconds { get; set; } = 900;

    /// <summary>Refresh-token lifetime in seconds, and the life of a session family.</summary>
    [ConfigurationKeyName("REFRESH_TOKEN_TTL_SECONDS")]
    public int RefreshTokenTtlSeconds { get; set; } = 604_800;

    /// <summary>bcrypt cost. Raise it, never lower it.</summary>
    [ConfigurationKeyName("BCRYPT_ROUNDS")]
    public int BcryptRounds { get; set; } = 12;

    /// <summary>Whether the refresh cookie carries Secure. Always on in Production.</summary>
    [ConfigurationKeyName("COOKIE_SECURE")]
    public bool CookieSecure { get; set; }

    /// <summary>Comma-separated browser origins allowed to call the API with credentials.</summary>
    [ConfigurationKeyName("CORS_ORIGINS")]
    public string CorsOrigins { get; set; } = "http://localhost:3000";

    /// <summary>Requests a minute on the credential endpoints, per client address.</summary>
    [ConfigurationKeyName("AUTH_RATE_LIMIT")]
    public int AuthRateLimit { get; set; } = 10;

    /// <summary>Requests a minute on reads, per user.</summary>
    [ConfigurationKeyName("READ_RATE_LIMIT")]
    public int ReadRateLimit { get; set; } = 300;

    /// <summary>Requests a minute on writes, per user, on top of the read limit.</summary>
    [ConfigurationKeyName("WRITE_RATE_LIMIT")]
    public int WriteRateLimit { get; set; } = 60;

    /// <summary>Failed logins an account may have before it locks.</summary>
    [ConfigurationKeyName("LOGIN_MAX_ATTEMPTS")]
    public int LoginMaxAttempts { get; set; } = 5;

    /// <summary>How long a locked account stays locked, re-armed by every further failure.</summary>
    [ConfigurationKeyName("LOGIN_LOCKOUT_SECONDS")]
    public int LoginLockoutSeconds { get; set; } = 900;

    /// <summary>Whether an empty identity database gets the four demo accounts.</summary>
    [ConfigurationKeyName("SEED_ON_STARTUP")]
    public bool SeedOnStartup { get; set; } = true;

    /// <summary>The shared password of the demo accounts. Reaches new databases only.</summary>
    [ConfigurationKeyName("SEED_USER_PASSWORD")]
    public string SeedUserPassword { get; set; } = "FusionDemo!2026";

    /// <summary>Port for the API, health, readiness and metrics.</summary>
    [ConfigurationKeyName("HTTP_PORT")]
    public int HttpPort { get; set; } = 8080;
}
