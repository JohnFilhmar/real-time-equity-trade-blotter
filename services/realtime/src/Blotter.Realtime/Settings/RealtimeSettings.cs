using Microsoft.Extensions.Configuration;

namespace Blotter.Realtime.Settings;

/// <summary>Everything the realtime service reads from its environment, validated once at boot.</summary>
internal sealed class RealtimeSettings
{
    /// <summary>AMQP URL of the broker trade changes arrive on.</summary>
    [ConfigurationKeyName("RABBITMQ_URL")]
    public string RabbitMqUrl { get; set; } = string.Empty;

    /// <summary>StackExchange.Redis configuration, such as <c>redis:6379</c>. Holds the backplane, the sequence and the marks.</summary>
    [ConfigurationKeyName("REDIS_CONNECTION")]
    public string RedisConnection { get; set; } = string.Empty;

    /// <summary>Secret the gateway signs access tokens with. Every hub connection is verified against it.</summary>
    [ConfigurationKeyName("JWT_ACCESS_SECRET")]
    public string JwtAccessSecret { get; set; } = string.Empty;

    /// <summary>Comma-separated origins allowed to open the hub, such as <c>http://localhost:3000</c>.</summary>
    [ConfigurationKeyName("CORS_ORIGINS")]
    public string CorsOrigins { get; set; } = "http://localhost:3000";

    /// <summary>Port for the hub, health, readiness and metrics.</summary>
    [ConfigurationKeyName("HTTP_PORT")]
    public int HttpPort { get; set; } = 8080;

    /// <summary>Whether simulated marks move. Off in tests that assert on a quiet hub.</summary>
    [ConfigurationKeyName("MARK_FEED_ENABLED")]
    public bool MarkFeedEnabled { get; set; } = true;

    /// <summary>How often the marks move, in milliseconds.</summary>
    [ConfigurationKeyName("MARK_INTERVAL_MS")]
    public int MarkIntervalMs { get; set; } = 900;
}
