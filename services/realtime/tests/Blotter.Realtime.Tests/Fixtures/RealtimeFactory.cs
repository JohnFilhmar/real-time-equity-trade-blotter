using System.Security.Claims;
using System.Text.Json;
using System.Threading.Channels;
using Blotter.Contracts.Json;
using Blotter.Contracts.Wire;
using Blotter.Realtime.Hubs;
using Blotter.Realtime.Messaging;
using Blotter.ServiceDefaults.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http.Connections;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace Blotter.Realtime.Tests.Fixtures;

/// <summary>Hosts the real realtime service in memory against the test Redis and RabbitMQ.</summary>
/// <param name="infrastructure">The containers.</param>
public sealed class RealtimeFactory(RealtimeInfrastructure infrastructure) : WebApplicationFactory<Program>
{
    /// <summary>The access-token secret the hosted service verifies against.</summary>
    public const string Secret = "test-access-secret-0123456789abcdefghij";

    /// <summary>The one browser origin the hosted service allows.</summary>
    public const string AllowedOrigin = "http://localhost:3000";

    /// <summary>Every hub event name, in the order the frontend listens for them.</summary>
    public static readonly string[] EventNames =
        ["trade.created", "trade.amended", "trade.cancelled", "trade_event.recorded", "position.updated", "mark.updated"];

    /// <summary>Signs an access token the way the gateway does.</summary>
    /// <param name="role">The caller's role.</param>
    /// <param name="secret">The signing secret; anything but <see cref="Secret"/> is a forgery.</param>
    /// <returns>A compact JWT.</returns>
    public static string Token(Role role = Role.Viewer, string secret = Secret) =>
        new JsonWebTokenHandler().CreateToken(new SecurityTokenDescriptor
        {
            Issuer = AccessTokens.Issuer,
            Audience = AccessTokens.Audience,
            Expires = DateTime.UtcNow.AddMinutes(15),
            Subject = new ClaimsIdentity(
            [
                new Claim(AccessClaims.SubjectClaim, Guid.NewGuid().ToString()),
                new Claim(AccessClaims.UsernameClaim, "viewer"),
                new Claim(AccessClaims.TraderCodeClaim, "VIEWER"),
                new Claim(AccessClaims.RoleClaim, WireNames.Of(role)),
            ]),
            SigningCredentials = new SigningCredentials(AccessTokens.SigningKey(secret), SecurityAlgorithms.HmacSha256),
        });

    /// <summary>
    /// Connects a SignalR client over long polling, which the in-memory server supports, and records
    /// every hub event it receives as raw JSON, in arrival order.
    /// </summary>
    /// <param name="token">The access token, or null for an anonymous attempt.</param>
    /// <returns>The started connection and the reader of received events.</returns>
    public async Task<(HubConnection Connection, ChannelReader<(string Name, JsonElement Payload)> Received)> ConnectAsync(string? token)
    {
        var received = Channel.CreateUnbounded<(string, JsonElement)>();
        var connection = new HubConnectionBuilder()
            .WithUrl(new Uri(Server.BaseAddress, BlotterHub.Path.TrimStart('/')), options =>
            {
                options.HttpMessageHandlerFactory = _ => Server.CreateHandler();
                options.Transports = HttpTransportType.LongPolling;
                options.AccessTokenProvider = () => Task.FromResult(token);
            })
            .AddJsonProtocol(options => BlotterJson.Configure(options.PayloadSerializerOptions))
            .Build();

        foreach (var name in EventNames)
        {
            connection.On<JsonElement>(name, payload => received.Writer.TryWrite((name, payload)));
        }

        await connection.StartAsync();
        return (connection, received.Reader);
    }

    /// <summary>Waits until the service's consumer has bound its queue, so a published message cannot miss it.</summary>
    /// <returns>A task that completes once the consumer is connected.</returns>
    public async Task WaitForConsumerAsync()
    {
        var consumer = Services.GetRequiredService<TradeChangeConsumer>();
        for (var attempt = 0; attempt < 200 && !consumer.IsConnected; attempt++)
        {
            await Task.Delay(50);
        }

        if (!consumer.IsConnected)
        {
            throw new TimeoutException("The trade change consumer never connected to the broker");
        }
    }

    /// <inheritdoc />
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        ArgumentNullException.ThrowIfNull(builder);

        builder.UseSetting("RABBITMQ_URL", infrastructure.RabbitMqUrl);
        builder.UseSetting("REDIS_CONNECTION", infrastructure.RedisConnection);
        builder.UseSetting("JWT_ACCESS_SECRET", Secret);
        builder.UseSetting("CORS_ORIGINS", AllowedOrigin);
        builder.UseSetting("MARK_FEED_ENABLED", "false");
        builder.UseSetting("LOG_LEVEL", "warn");
    }
}
