using Blotter.Contracts.Wire;
using Blotter.Trades.Data;
using Blotter.Trades.Domain;
using Blotter.Trades.Outbox;
using Blotter.Trades.Repositories;
using Blotter.Trades.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Blotter.Trades.Tests.Fixtures;

/// <summary>
/// A test class's own migrated database, and the service wired to it exactly as the host wires it.
/// Each call to <see cref="Service"/> or <see cref="Context"/> uses a fresh context, as each request does.
/// </summary>
/// <param name="server">The shared SQL Server.</param>
public class TradesDatabase(SqlServerFixture server) : IAsyncLifetime
{
    /// <summary>The desk limits the host uses by default.</summary>
    internal static readonly NotionalLimits DefaultLimits = new(50_000_000m, 4_000_000_000m);

    /// <summary>An ordinary trader booking under their own desk code.</summary>
    internal static readonly TradeActor Trader = new("JSMITH", Role.Trader, TradeEventSource.Api);

    private readonly List<TradesDbContext> contexts = [];

    /// <summary>The database's connection string, as the system administrator.</summary>
    protected string ConnectionString { get; private set; } = string.Empty;

    /// <summary>The shared SQL Server, for tests that need the server rather than their own database.</summary>
    protected SqlServerFixture Server => server;

    /// <summary>The clock writes are stamped with.</summary>
    internal TimeProvider Clock { get; set; } = TimeProvider.System;

    /// <summary>A fresh service over a fresh context.</summary>
    internal TradeService Service => new(Repository, DefaultLimits, new OutboxSignal());

    /// <summary>A fresh repository over a fresh context.</summary>
    internal TradeRepository Repository => new(Context(), Clock);

    /// <summary>An actor with any desk code, role and source.</summary>
    internal static TradeActor ActorFor(string traderCode, Role role = Role.Trader, TradeEventSource source = TradeEventSource.Api) =>
        new(traderCode, role, source);

    /// <summary>A valid ticket, the C# twin of the Node tests' <c>a_create_payload</c>.</summary>
    internal static TradeTicket ATicket(
        string symbol = "AAPL",
        TradeSide side = TradeSide.Buy,
        int quantity = 5000,
        decimal price = 227.45m,
        string book = "EQUITIES_US",
        string counterparty = "Goldman Sachs",
        string tradeTimestamp = "2026-08-18T09:15:23.000Z") =>
        new(symbol, side, quantity, price, book, counterparty, DateTimeOffset.Parse(tradeTimestamp, System.Globalization.CultureInfo.InvariantCulture));

    /// <summary>A fresh context, disposed with the test class.</summary>
    internal TradesDbContext Context()
    {
        var context = new TradesDbContext(new DbContextOptionsBuilder<TradesDbContext>().UseSqlServer(ConnectionString).Options);
        contexts.Add(context);
        return context;
    }

    /// <summary>
    /// A container wired the way the host wires the scoped services, for the background services that
    /// open a scope per pass.
    /// </summary>
    /// <param name="connectionString">The database to use, or null for this class's own.</param>
    /// <returns>The provider. Dispose it with the test.</returns>
    internal ServiceProvider BuildServices(string? connectionString = null)
    {
        var services = new ServiceCollection();
        services.AddDbContext<TradesDbContext>(options => options.UseSqlServer(connectionString ?? ConnectionString));
        services.AddSingleton(Clock);
        services.AddSingleton(DefaultLimits);
        services.AddSingleton<OutboxSignal>();
        services.AddScoped<TradeRepository>();
        services.AddScoped<TradeService>();
        return services.BuildServiceProvider();
    }

    /// <inheritdoc />
    public async ValueTask InitializeAsync() => ConnectionString = await server.CreateDatabaseAsync();

    /// <inheritdoc />
    public virtual async ValueTask DisposeAsync()
    {
        foreach (var context in contexts)
        {
            await context.DisposeAsync();
        }

        GC.SuppressFinalize(this);
    }
}
