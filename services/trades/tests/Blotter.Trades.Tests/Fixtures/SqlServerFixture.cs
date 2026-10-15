using Blotter.Trades.Data;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Testcontainers.MsSql;
using Xunit;

[assembly: AssemblyFixture(typeof(Blotter.Trades.Tests.Fixtures.SqlServerFixture))]

namespace Blotter.Trades.Tests.Fixtures;

/// <summary>
/// One real SQL Server for the whole run. Every test class gets its own freshly migrated database
/// from it, so classes never see each other's rows and nothing is mocked.
/// </summary>
public sealed class SqlServerFixture : IAsyncLifetime
{
    /// <summary>The image the compose file runs, so the tests exercise the same engine.</summary>
    public const string Image = "mcr.microsoft.com/mssql/server:2022-CU27-ubuntu-22.04";

    private readonly MsSqlContainer container = new MsSqlBuilder(Image).Build();

    /// <summary>A connection string for the server as the system administrator, with no database chosen.</summary>
    public string AdminConnectionString => container.GetConnectionString();

    /// <summary>Creates a new database and applies every migration to it.</summary>
    /// <returns>A connection string for the new database, as the system administrator.</returns>
    public async Task<string> CreateDatabaseAsync()
    {
        var connectionString = new SqlConnectionStringBuilder(container.GetConnectionString())
        {
            InitialCatalog = $"trades_{Guid.NewGuid():N}",
        }.ConnectionString;

        await using var db = new TradesDbContext(new DbContextOptionsBuilder<TradesDbContext>().UseSqlServer(connectionString).Options);
        await db.Database.MigrateAsync();
        return connectionString;
    }

    /// <inheritdoc />
    public async ValueTask InitializeAsync() => await container.StartAsync();

    /// <inheritdoc />
    public async ValueTask DisposeAsync() => await container.DisposeAsync();
}
