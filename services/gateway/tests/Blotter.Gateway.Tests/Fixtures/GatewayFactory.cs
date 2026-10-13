using Blotter.Contracts.Grpc;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;

namespace Blotter.Gateway.Tests.Fixtures;

/// <summary>
/// The real gateway in memory, configured from the environment's settings, with its gRPC client
/// pointed at the in-memory trades service instead of a network address.
/// </summary>
/// <param name="settings">Environment variables, as the container would receive them.</param>
/// <param name="trades">The trades service behind it.</param>
/// <param name="configureServices">Last-minute service replacements, such as a fake clock.</param>
public sealed class GatewayFactory(
    IReadOnlyDictionary<string, string> settings,
    TradesFactory trades,
    Action<IServiceCollection> configureServices) : WebApplicationFactory<Program>
{
    /// <inheritdoc />
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        ArgumentNullException.ThrowIfNull(builder);

        foreach (var (key, value) in settings)
        {
            builder.UseSetting(key, value);
        }

        builder.ConfigureTestServices(services =>
        {
            services
                .AddGrpcClient<Trades.TradesClient>(options => options.Address = trades.Server.BaseAddress)
                .ConfigurePrimaryHttpMessageHandler(() => trades.Server.CreateHandler());
            configureServices(services);
        });
    }
}
