using Blotter.Contracts.Wire;
using Blotter.Gateway.Auth;
using Blotter.Gateway.Data;
using Blotter.Gateway.Settings;
using Blotter.Gateway.Tests.Fixtures;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace Blotter.Gateway.Tests;

/// <summary>The demo accounts, ported from the Node API's <c>seed_users.test.ts</c>, against a fresh identity database per test.</summary>
/// <param name="sql">The shared SQL Server.</param>
public sealed class UserSeederTests(SqlServerFixture sql) : IAsyncLifetime
{
    private static readonly GatewaySettings Settings = new() { BcryptRounds = 10, SeedUserPassword = GatewayEnvironment.Password };

    private IdentityDbContext? db;

    private IdentityDbContext Db => db!;

    private UserSeeder Seeder => new(Db, new PasswordHasher(Settings), Settings, TimeProvider.System, NullLogger<UserSeeder>.Instance);

    [Fact]
    public async Task It_creates_the_four_demo_accounts_in_an_empty_database()
    {
        Assert.Equal(4, await Seeder.SeedIfEmptyAsync(CancellationToken.None));

        Assert.Equal(["abrown", "jsmith", "mjones", "viewer"], await Db.Users.Select(user => user.Username).OrderBy(name => name).ToListAsync());
    }

    [Fact]
    public async Task It_gives_every_account_the_configured_seed_password()
    {
        await Seeder.SeedIfEmptyAsync(CancellationToken.None);

        Assert.All(await Db.Users.ToListAsync(), user => Assert.True(PasswordHasher.Verify(GatewayEnvironment.Password, user.PasswordHash)));
    }

    [Fact]
    public async Task It_issues_the_three_roles_a_reviewer_signs_in_with()
    {
        await Seeder.SeedIfEmptyAsync(CancellationToken.None);

        var accounts = await Db.Users.OrderBy(user => user.Username).Select(user => new { user.Username, user.DisplayName, user.TraderCode, user.Role }).ToListAsync();
        Assert.Equal(
            [
                new { Username = "abrown", DisplayName = "A. Brown", TraderCode = "ABROWN", Role = Role.Trader },
                new { Username = "jsmith", DisplayName = "J. Smith", TraderCode = "JSMITH", Role = Role.Trader },
                new { Username = "mjones", DisplayName = "M. Jones", TraderCode = "MJONES", Role = Role.Admin },
                new { Username = "viewer", DisplayName = "Read Only", TraderCode = "VIEWER", Role = Role.Viewer },
            ],
            accounts);
    }

    [Fact]
    public async Task It_creates_nothing_when_an_account_already_exists_so_a_changed_seed_password_never_reaches_a_populated_database()
    {
        var now = DateTimeOffset.UtcNow;
        Db.Users.Add(new UserRow
        {
            Id = Guid.CreateVersion7(now),
            Username = "someone",
            PasswordHash = "the-old-hash",
            DisplayName = "Someone",
            TraderCode = "SOMEONE",
            Role = Role.Trader,
            CreatedAt = now,
            UpdatedAt = now,
        });
        await Db.SaveChangesAsync();

        Assert.Equal(0, await Seeder.SeedIfEmptyAsync(CancellationToken.None));
        Assert.Equal(1, await Db.Users.CountAsync());
    }

    /// <inheritdoc />
    public async ValueTask InitializeAsync() =>
        db = new IdentityDbContext(new DbContextOptionsBuilder<IdentityDbContext>().UseSqlServer(await sql.CreateIdentityDatabaseAsync()).Options);

    /// <inheritdoc />
    public async ValueTask DisposeAsync()
    {
        if (db is not null)
        {
            await db.DisposeAsync();
        }
    }
}
