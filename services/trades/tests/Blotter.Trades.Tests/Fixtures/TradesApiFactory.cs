using Blotter.Contracts.Grpc;
using Grpc.Core;
using Grpc.Net.Client;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Blotter.Trades.Tests.Fixtures;

/// <summary>
/// Hosts the real trades service in memory against a test database, with the simulated desk, the
/// seed and the broker switched off, and hands out gRPC clients that reach it through the real pipeline.
/// </summary>
/// <param name="connectionString">The test database.</param>
public sealed class TradesApiFactory(string connectionString) : WebApplicationFactory<Program>
{
    /// <summary>A gRPC client over an in-memory channel to the hosted service.</summary>
    /// <returns>The client.</returns>
    public Contracts.Grpc.Trades.TradesClient Client()
    {
        var channel = GrpcChannel.ForAddress(Server.BaseAddress, new GrpcChannelOptions { HttpHandler = Server.CreateHandler() });
        return new Contracts.Grpc.Trades.TradesClient(channel);
    }

    /// <summary>Call metadata carrying a bearer token.</summary>
    /// <param name="token">The access token.</param>
    /// <returns>The metadata.</returns>
    public static Metadata Bearer(string token) => new() { { "authorization", $"Bearer {token}" } };

    /// <inheritdoc />
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        ArgumentNullException.ThrowIfNull(builder);

        builder.UseSetting("DATABASE_CONNECTION", connectionString);
        builder.UseSetting("JWT_ACCESS_SECRET", TestTokens.Secret);
        builder.UseSetting("OUTBOX_DISPATCH_ENABLED", "false");
        builder.UseSetting("LIVE_FEED_ENABLED", "false");
        builder.UseSetting("SEED_ON_STARTUP", "false");
        builder.UseSetting("LOG_LEVEL", "warn");
    }
}
