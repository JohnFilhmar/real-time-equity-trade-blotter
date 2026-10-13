extern alias trades;

using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;

namespace Blotter.Gateway.Tests.Fixtures;

/// <summary>
/// The real trades service in memory, as the gateway's tests reach it: its own database, the same
/// access secret as the gateway, and the simulated desk, the seed and the broker switched off. The
/// outbox still fills, which is how a test sees what would have been broadcast.
/// </summary>
/// <param name="connectionString">The trades database.</param>
/// <param name="clock">A clock to stamp writes with, or null for the system clock.</param>
public sealed class TradesFactory(string connectionString, TimeProvider? clock) : WebApplicationFactory<trades::Program>
{
    /// <inheritdoc />
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        ArgumentNullException.ThrowIfNull(builder);

        builder.UseSetting("DATABASE_CONNECTION", connectionString);
        builder.UseSetting("JWT_ACCESS_SECRET", GatewayEnvironment.AccessSecret);
        builder.UseSetting("OUTBOX_DISPATCH_ENABLED", "false");
        builder.UseSetting("LIVE_FEED_ENABLED", "false");
        builder.UseSetting("SEED_ON_STARTUP", "false");
        builder.UseSetting("LOG_LEVEL", "warn");

        if (clock is not null)
        {
            builder.ConfigureTestServices(services => services.AddSingleton(clock));
        }
    }
}
