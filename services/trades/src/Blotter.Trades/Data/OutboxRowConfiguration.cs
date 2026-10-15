using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Blotter.Trades.Data;

/// <summary>Maps <see cref="OutboxRow"/> onto the <c>outbox_message</c> table.</summary>
internal sealed class OutboxRowConfiguration : IEntityTypeConfiguration<OutboxRow>
{
    /// <summary>Configures the table.</summary>
    /// <param name="builder">The entity builder.</param>
    public void Configure(EntityTypeBuilder<OutboxRow> builder)
    {
        builder.ToTable("outbox_message", table =>
            table.HasCheckConstraint("outbox_message_payload_check", "ISJSON([payload]) = 1"));

        builder.HasKey(message => message.Id).HasName("outbox_message_pkey");
        builder.Property(message => message.Id).HasColumnName("id").UseIdentityColumn();
        builder.Property(message => message.Payload).HasColumnName("payload");
        builder.Property(message => message.CreatedAt).HasColumnName("created_at").HasPrecision(3);
        builder.Property(message => message.PublishedAt).HasColumnName("published_at").HasPrecision(3);

        // The dispatcher's only query is "unpublished rows, oldest first", so the index holds exactly those.
        builder.HasIndex(message => message.Id)
            .HasFilter("[published_at] IS NULL")
            .HasDatabaseName("outbox_message_pending_idx");
    }
}
