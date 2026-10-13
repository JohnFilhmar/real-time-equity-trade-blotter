using Blotter.Contracts.Json;
using Blotter.Contracts.Wire;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Blotter.Trades.Data;

/// <summary>
/// Maps <see cref="TradeRow"/> onto the <c>trade</c> table with the Postgres schema's column names,
/// indexes and constraints. Enums are stored as their wire names and checked by the database.
/// </summary>
internal sealed class TradeRowConfiguration : IEntityTypeConfiguration<TradeRow>
{
    /// <summary>
    /// Case-insensitive, accent-sensitive, so a filter box matching <c>equities</c> finds
    /// <c>EQUITIES_UK</c> exactly as Postgres <c>ILIKE</c> did, whatever the server's default collation.
    /// </summary>
    public const string FilterCollation = "Latin1_General_100_CI_AS";

    /// <summary>Configures the table.</summary>
    /// <param name="builder">The entity builder.</param>
    public void Configure(EntityTypeBuilder<TradeRow> builder)
    {
        builder.ToTable("trade", table =>
        {
            table.HasCheckConstraint("trade_side_check", "[side] IN ('BUY', 'SELL')");
            table.HasCheckConstraint("trade_status_check", "[status] IN ('ACTIVE', 'CANCELLED')");
            table.HasCheckConstraint("trade_currency_check", "[currency] IN ('USD', 'GBX')");
            table.HasCheckConstraint("trade_quantity_check", "[quantity] > 0");
            table.HasCheckConstraint("trade_price_check", "[price] > 0");
            table.HasCheckConstraint("trade_version_check", "[version] >= 1");
        });

        builder.HasKey(trade => trade.Id).HasName("trade_pkey");
        builder.Property(trade => trade.Id).HasColumnName("id").ValueGeneratedNever();
        builder.Property(trade => trade.TradeId).HasColumnName("trade_id").HasMaxLength(24).IsUnicode(false);
        builder.Property(trade => trade.Symbol).HasColumnName("symbol").HasMaxLength(12).IsUnicode(false).UseCollation(FilterCollation);
        builder.Property(trade => trade.Side).HasColumnName("side").HasMaxLength(4).IsUnicode(false)
            .HasConversion(side => WireNames.Of(side), name => WireNames.Parse<TradeSide>(name));
        builder.Property(trade => trade.Quantity).HasColumnName("quantity");
        builder.Property(trade => trade.Price).HasColumnName("price").HasPrecision(18, 6);
        builder.Property(trade => trade.Currency).HasColumnName("currency").HasMaxLength(3).IsUnicode(false)
            .HasConversion(currency => WireNames.Of(currency), name => WireNames.Parse<Currency>(name));
        builder.Property(trade => trade.Trader).HasColumnName("trader").HasMaxLength(32).UseCollation(FilterCollation);
        builder.Property(trade => trade.Book).HasColumnName("book").HasMaxLength(64).UseCollation(FilterCollation);
        builder.Property(trade => trade.Counterparty).HasColumnName("counterparty").HasMaxLength(128).UseCollation(FilterCollation);
        builder.Property(trade => trade.TradeTimestamp).HasColumnName("trade_timestamp").HasPrecision(3);
        builder.Property(trade => trade.Status).HasColumnName("status").HasMaxLength(9).IsUnicode(false)
            .HasConversion(status => WireNames.Of(status), name => WireNames.Parse<TradeStatus>(name));
        builder.Property(trade => trade.Version).HasColumnName("version").HasDefaultValue(1);
        builder.Property(trade => trade.CreatedAt).HasColumnName("created_at").HasPrecision(3);
        builder.Property(trade => trade.UpdatedAt).HasColumnName("updated_at").HasPrecision(3);

        builder.HasIndex(trade => trade.TradeId).IsUnique().HasDatabaseName("trade_trade_id_key");
        builder.HasIndex(trade => new { trade.Status, trade.TradeTimestamp })
            .IsDescending(false, true)
            .HasDatabaseName("trade_status_timestamp_idx");
        builder.HasIndex(trade => new { trade.Symbol, trade.TradeTimestamp })
            .IsDescending(false, true)
            .HasDatabaseName("trade_symbol_timestamp_idx");
        builder.HasIndex(trade => trade.Trader).HasDatabaseName("trade_trader_idx");
        builder.HasIndex(trade => trade.Book).HasDatabaseName("trade_book_idx");
    }
}
