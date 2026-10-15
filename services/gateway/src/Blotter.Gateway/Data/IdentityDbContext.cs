using Blotter.Contracts.Json;
using Blotter.Contracts.Wire;
using Microsoft.EntityFrameworkCore;

namespace Blotter.Gateway.Data;

/// <summary>The gateway's own database: the accounts people sign in with, and nothing else.</summary>
/// <param name="options">Options carrying the SQL Server connection.</param>
internal sealed class IdentityDbContext(DbContextOptions<IdentityDbContext> options) : DbContext(options)
{
    /// <summary>
    /// Case-sensitive, so <c>JSmith</c> is not <c>jsmith</c>, matching Postgres's default. Login
    /// lockout still lower-cases the name, so the two cannot be attacked as separate budgets.
    /// </summary>
    public const string UsernameCollation = "Latin1_General_100_CS_AS";

    /// <summary>The <c>app_user</c> table.</summary>
    public DbSet<UserRow> Users => Set<UserRow>();

    /// <inheritdoc />
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var user = modelBuilder.Entity<UserRow>();

        user.ToTable("app_user", table =>
            table.HasCheckConstraint("app_user_role_check", "[role] IN ('VIEWER', 'TRADER', 'ADMIN')"));
        user.HasKey(row => row.Id).HasName("app_user_pkey");
        user.Property(row => row.Id).HasColumnName("id").ValueGeneratedNever();
        user.Property(row => row.Username).HasColumnName("username").HasMaxLength(64).IsUnicode(false).UseCollation(UsernameCollation);
        user.Property(row => row.PasswordHash).HasColumnName("password_hash").HasMaxLength(255).IsUnicode(false);
        user.Property(row => row.DisplayName).HasColumnName("display_name").HasMaxLength(128);
        user.Property(row => row.TraderCode).HasColumnName("trader_code").HasMaxLength(32);
        user.Property(row => row.Role).HasColumnName("role").HasMaxLength(6).IsUnicode(false)
            .HasConversion(role => WireNames.Of(role), name => WireNames.Parse<Role>(name));
        user.Property(row => row.CreatedAt).HasColumnName("created_at").HasPrecision(3);
        user.Property(row => row.UpdatedAt).HasColumnName("updated_at").HasPrecision(3);

        user.HasIndex(row => row.Username).IsUnique().HasDatabaseName("app_user_username_key");
        user.HasIndex(row => row.TraderCode).HasDatabaseName("app_user_trader_code_idx");
    }
}
