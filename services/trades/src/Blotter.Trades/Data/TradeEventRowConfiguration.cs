using Blotter.Contracts.Json;
using Blotter.Contracts.Wire;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Blotter.Trades.Data;

/// <summary>
/// Maps <see cref="TradeEventRow"/> onto the <c>trade_event</c> table. The foreign key does not
/// cascade: a trade with history cannot be deleted, and the append-only trigger added in the first
/// migration refuses every update or delete of an event row.
/// </summary>
internal sealed class TradeEventRowConfiguration : IEntityTypeConfiguration<TradeEventRow>
{
    /// <summary>Configures the table.</summary>
    /// <param name="builder">The entity builder.</param>
    public void Configure(EntityTypeBuilder<TradeEventRow> builder)
    {
        builder.ToTable("trade_event", table =>
        {
            table.HasCheckConstraint("trade_event_action_check", "[action] IN ('AMENDED', 'CANCELLED')");
            table.HasCheckConstraint("trade_event_source_check", "[source] IN ('API', 'LIVE_FEED')");
            table.HasCheckConstraint("trade_event_changes_check", "ISJSON([changes]) = 1");
        });

        builder.HasKey(tradeEvent => tradeEvent.Id).HasName("trade_event_pkey");
        TradeRowConfiguration.ConfigureId(builder.Property(tradeEvent => tradeEvent.Id), "id");
        builder.Property(tradeEvent => tradeEvent.Id).ValueGeneratedNever();
        TradeRowConfiguration.ConfigureId(builder.Property(tradeEvent => tradeEvent.TradeUuid), "trade_uuid");
        builder.Property(tradeEvent => tradeEvent.Version).HasColumnName("version");
        builder.Property(tradeEvent => tradeEvent.Action).HasColumnName("action").HasMaxLength(9).IsUnicode(false)
            .HasConversion(action => WireNames.Of(action), name => WireNames.Parse<TradeEventAction>(name));
        builder.Property(tradeEvent => tradeEvent.Source).HasColumnName("source").HasMaxLength(9).IsUnicode(false)
            .HasConversion(source => WireNames.Of(source), name => WireNames.Parse<TradeEventSource>(name));
        builder.Property(tradeEvent => tradeEvent.Changes).HasColumnName("changes");
        builder.Property(tradeEvent => tradeEvent.Actor).HasColumnName("actor").HasMaxLength(32);
        builder.Property(tradeEvent => tradeEvent.OccurredAt).HasColumnName("occurred_at").HasPrecision(3);

        builder.HasOne(tradeEvent => tradeEvent.Trade)
            .WithMany()
            .HasForeignKey(tradeEvent => tradeEvent.TradeUuid)
            .HasConstraintName("trade_event_trade_uuid_fkey")
            .OnDelete(DeleteBehavior.NoAction);

        builder.HasIndex(tradeEvent => new { tradeEvent.TradeUuid, tradeEvent.Version })
            .HasDatabaseName("trade_event_trade_version_idx");
        builder.HasIndex(tradeEvent => new { tradeEvent.OccurredAt, tradeEvent.Id })
            .IsDescending(true, true)
            .HasDatabaseName("trade_event_occurred_idx");
    }
}
