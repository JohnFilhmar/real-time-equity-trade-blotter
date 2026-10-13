using Microsoft.EntityFrameworkCore;

namespace Blotter.Trades.Data;

/// <summary>The trades service's own database: trades, their audit trail, and the outbox.</summary>
/// <param name="options">Options carrying the SQL Server connection.</param>
internal sealed class TradesDbContext(DbContextOptions<TradesDbContext> options) : DbContext(options)
{
    /// <summary>The sequence business trade ids are drawn from. It starts at 100001, as the Postgres one did.</summary>
    public const string TradeIdSequence = "trade_id_seq";

    /// <summary>The <c>trade</c> table.</summary>
    public DbSet<TradeRow> Trades => Set<TradeRow>();

    /// <summary>The append-only <c>trade_event</c> table.</summary>
    public DbSet<TradeEventRow> TradeEvents => Set<TradeEventRow>();

    /// <summary>The <c>outbox_message</c> table.</summary>
    public DbSet<OutboxRow> Outbox => Set<OutboxRow>();

    /// <inheritdoc />
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasSequence<long>(TradeIdSequence).StartsAt(100_001).IncrementsBy(1);
        modelBuilder.ApplyConfiguration(new TradeRowConfiguration());
        modelBuilder.ApplyConfiguration(new TradeEventRowConfiguration());
        modelBuilder.ApplyConfiguration(new OutboxRowConfiguration());
    }
}
