extern alias trades;

using Blotter.Gateway.Data;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Testcontainers.MsSql;
using Xunit;
using TradesDbContext = trades::Blotter.Trades.Data.TradesDbContext;

[assembly: AssemblyFixture(typeof(Blotter.Gateway.Tests.Fixtures.SqlServerFixture))]

namespace Blotter.Gateway.Tests.Fixtures;

/// <summary>
/// One real SQL Server for the whole run. Every environment gets its own freshly migrated identity
/// and trades databases from it, so test classes never see each other's rows.
/// </summary>
public sealed class SqlServerFixture : IAsyncLifetime
{
    /// <summary>The image the compose file runs, so the tests exercise the same engine.</summary>
    public const string Image = "mcr.microsoft.com/mssql/server:2022-CU27-ubuntu-22.04";

    private readonly MsSqlContainer container = new MsSqlBuilder(Image).Build();

    /// <summary>Creates a new identity database and applies the gateway's migrations to it.</summary>
    /// <returns>A connection string for the new database, as the system administrator.</returns>
    public async Task<string> CreateIdentityDatabaseAsync()
    {
        var connectionString = NewDatabase("identity");
        await using var db = new IdentityDbContext(new DbContextOptionsBuilder<IdentityDbContext>().UseSqlServer(connectionString).Options);
        await db.Database.MigrateAsync();
        return connectionString;
    }

    /// <summary>Creates a new trades database and applies the trades service's migrations to it.</summary>
    /// <returns>A connection string for the new database, as the system administrator.</returns>
    public async Task<string> CreateTradesDatabaseAsync()
    {
        var connectionString = NewDatabase("trades");
        await using var db = new TradesDbContext(new DbContextOptionsBuilder<TradesDbContext>().UseSqlServer(connectionString).Options);
        await db.Database.MigrateAsync();
        return connectionString;
    }

    /// <inheritdoc />
    public async ValueTask InitializeAsync() => await container.StartAsync();

    /// <inheritdoc />
    public async ValueTask DisposeAsync() => await container.DisposeAsync();

    private string NewDatabase(string prefix) =>
        new SqlConnectionStringBuilder(container.GetConnectionString()) { InitialCatalog = $"{prefix}_{Guid.NewGuid():N}" }.ConnectionString;
}
