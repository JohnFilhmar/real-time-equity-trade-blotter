using Blotter.Trades.Data;
using Blotter.Trades.Domain;
using Blotter.Trades.Outbox;
using Blotter.Trades.Repositories;
using Blotter.Trades.Services;
using Blotter.Trades.Tests.Fixtures;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Blotter.Trades.Tests;

/// <summary>
/// The audit trail is append-only because the database says so, not because the code is careful.
/// Ported from the Node suite's append-only tests, plus the guarantee the Postgres version did not
/// have: the runtime login cannot delete history, truncate it, or switch the trigger off.
/// </summary>
public sealed class AuditTrailTests(SqlServerFixture server) : TradesDatabase(server)
{
    [Fact]
    public async Task The_database_refuses_an_update_and_a_delete_and_leaves_the_row_as_written()
    {
        var created = await Service.CreateAsync(ATicket(), Trader, default);
        await Service.AmendAsync(created.TradeId, 1, new TradeChanges(7500, null, null), Trader, default);

        var update = await Assert.ThrowsAsync<SqlException>(() => Execute(ConnectionString, "UPDATE [trade_event] SET [actor] = 'TAMPERED'"));
        var delete = await Assert.ThrowsAsync<SqlException>(() => Execute(ConnectionString, "DELETE FROM [trade_event]"));

        Assert.Contains("append-only, UPDATE is not permitted", update.Message, StringComparison.Ordinal);
        Assert.Contains("append-only, DELETE is not permitted", delete.Message, StringComparison.Ordinal);
        Assert.Equal("JSMITH", Assert.Single(await Service.ListHistoryAsync(created.TradeId, default)).Actor);
    }

    [Fact]
    public async Task A_trade_with_history_cannot_be_deleted()
    {
        var created = await Service.CreateAsync(ATicket(), Trader, default);
        await Service.CancelAsync(created.TradeId, null, Trader, default);

        await Assert.ThrowsAsync<SqlException>(() => Execute(ConnectionString, $"DELETE FROM [trade] WHERE [trade_id] = '{created.TradeId}'"));

        Assert.NotNull(await Repository.FindAsync(created.TradeId, default));
    }

    [Fact]
    public async Task The_runtime_role_can_do_its_job_and_nothing_that_rewrites_history()
    {
        var appConnection = await CreateRuntimeLoginAsync();
        var appContext = new TradesDbContext(new DbContextOptionsBuilder<TradesDbContext>().UseSqlServer(appConnection).Options);
        var service = new TradeService(new TradeRepository(appContext, Clock), DefaultLimits, new OutboxSignal());

        var created = await service.CreateAsync(ATicket(), Trader, default);
        await service.AmendAsync(created.TradeId, 1, new TradeChanges(7500, null, null), Trader, default);
        await service.CancelAsync(created.TradeId, null, Trader, default);
        await appContext.Outbox.Where(row => row.Id > 0).ExecuteDeleteAsync();

        // The role holds no UPDATE on the event log, so the permission check refuses before the
        // trigger is even reached; the trigger is the second line, proven by the test above.
        Assert.Contains("UPDATE permission was denied", (await Assert.ThrowsAsync<SqlException>(() => Execute(appConnection, "UPDATE [trade_event] SET [actor] = 'X'"))).Message, StringComparison.Ordinal);
        await Assert.ThrowsAsync<SqlException>(() => Execute(appConnection, "DELETE FROM [trade_event]"));
        await Assert.ThrowsAsync<SqlException>(() => Execute(appConnection, "DELETE FROM [trade]"));
        await Assert.ThrowsAsync<SqlException>(() => Execute(appConnection, "TRUNCATE TABLE [trade_event]"));
        await Assert.ThrowsAsync<SqlException>(() => Execute(appConnection, "ALTER TABLE [trade_event] DISABLE TRIGGER [trade_event_append_only]"));

        Assert.Equal(2, (await Service.ListHistoryAsync(created.TradeId, default)).Count);
        await appContext.DisposeAsync();
    }

    private async Task<string> CreateRuntimeLoginAsync()
    {
        var login = $"trades_app_{Guid.NewGuid():N}"[..24];
        const string password = "Runtime-Login-Pass-2026!";
        var database = new SqlConnectionStringBuilder(ConnectionString).InitialCatalog;

        await Execute(Server.AdminConnectionString, $"CREATE LOGIN [{login}] WITH PASSWORD = '{password}'");
        await Execute(ConnectionString, $"CREATE USER [{login}] FOR LOGIN [{login}]; ALTER ROLE [trades_writer] ADD MEMBER [{login}];");

        return new SqlConnectionStringBuilder(Server.AdminConnectionString)
        {
            InitialCatalog = database,
            UserID = login,
            Password = password,
        }.ConnectionString;
    }

    private static async Task Execute(string connectionString, string sql)
    {
        await using var connection = new SqlConnection(connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
#pragma warning disable CA2100 // Test-only statements built from constants and generated names.
        command.CommandText = sql;
#pragma warning restore CA2100
        await command.ExecuteNonQueryAsync();
    }
}
