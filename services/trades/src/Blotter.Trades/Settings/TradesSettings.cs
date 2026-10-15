using Microsoft.Extensions.Configuration;

namespace Blotter.Trades.Settings;

/// <summary>
/// Everything the trades service reads from its environment, validated once at boot by
/// <see cref="TradesSettingsValidator"/>. Variable names match the Node API where the setting
/// already existed there.
/// </summary>
internal sealed class TradesSettings
{
    /// <summary>SQL Server connection string. The migrate job is given the owner login, the service the app login.</summary>
    [ConfigurationKeyName("DATABASE_CONNECTION")]
    public string DatabaseConnection { get; set; } = string.Empty;

    /// <summary>AMQP URL of the broker trade changes are published to.</summary>
    [ConfigurationKeyName("RABBITMQ_URL")]
    public string RabbitMqUrl { get; set; } = string.Empty;

    /// <summary>Whether committed changes are published at all. Off only in tests that have no broker.</summary>
    [ConfigurationKeyName("OUTBOX_DISPATCH_ENABLED")]
    public bool OutboxDispatchEnabled { get; set; } = true;

    /// <summary>Secret the gateway signs access tokens with. Every gRPC call is verified against it.</summary>
    [ConfigurationKeyName("JWT_ACCESS_SECRET")]
    public string JwtAccessSecret { get; set; } = string.Empty;

    /// <summary>Port for health, readiness and metrics, over HTTP/1.1.</summary>
    [ConfigurationKeyName("HTTP_PORT")]
    public int HttpPort { get; set; } = 8080;

    /// <summary>Port for the gRPC API, HTTP/2 without TLS, reachable only on the internal network.</summary>
    [ConfigurationKeyName("GRPC_PORT")]
    public int GrpcPort { get; set; } = 8081;

    /// <summary>Whether an empty database is seeded with demo trades at startup.</summary>
    [ConfigurationKeyName("SEED_ON_STARTUP")]
    public bool SeedOnStartup { get; set; } = true;

    /// <summary>How many trades the seed books into an empty database.</summary>
    [ConfigurationKeyName("SEED_TRADE_COUNT")]
    public int SeedTradeCount { get; set; } = 500;

    /// <summary>Whether the simulated desk runs.</summary>
    [ConfigurationKeyName("LIVE_FEED_ENABLED")]
    public bool LiveFeedEnabled { get; set; } = true;

    /// <summary>Shortest gap between two simulated actions, in milliseconds.</summary>
    [ConfigurationKeyName("LIVE_FEED_MIN_INTERVAL_MS")]
    public int LiveFeedMinIntervalMs { get; set; } = 3_000;

    /// <summary>Longest gap between two simulated actions, in milliseconds.</summary>
    [ConfigurationKeyName("LIVE_FEED_MAX_INTERVAL_MS")]
    public int LiveFeedMaxIntervalMs { get; set; } = 8_000;

    /// <summary>The size the simulated desk keeps its active book near.</summary>
    [ConfigurationKeyName("LIVE_FEED_MAX_ACTIVE_TRADES")]
    public int LiveFeedMaxActiveTrades { get; set; } = 2_000;

    /// <summary>Notional ceiling for a USD ticket, in dollars.</summary>
    [ConfigurationKeyName("MAX_NOTIONAL_USD")]
    public decimal MaxNotionalUsd { get; set; } = 50_000_000m;

    /// <summary>Notional ceiling for a GBX ticket, in pence.</summary>
    [ConfigurationKeyName("MAX_NOTIONAL_GBX")]
    public decimal MaxNotionalGbx { get; set; } = 4_000_000_000m;
}
