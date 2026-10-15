using Blotter.Contracts.Wire;
using Blotter.Gateway.Data;
using Blotter.Gateway.Settings;
using Microsoft.EntityFrameworkCore;

namespace Blotter.Gateway.Auth;

/// <summary>
/// Creates the four demo accounts in an empty identity database, one per role a demo user signs in
/// with. They share one documented password, which is only acceptable because this is a throwaway
/// stack, so the log says so out loud.
/// </summary>
/// <param name="db">The identity database.</param>
/// <param name="passwords">bcrypt.</param>
/// <param name="settings">The seed password.</param>
/// <param name="clock">Stamps the rows.</param>
/// <param name="logger">Records that demo accounts exist.</param>
internal sealed partial class UserSeeder(
    IdentityDbContext db,
    PasswordHasher passwords,
    GatewaySettings settings,
    TimeProvider clock,
    ILogger<UserSeeder> logger)
{
    /// <summary>
    /// The demo accounts. Their desk codes match traders in the seeded trades, so signing in as
    /// jsmith shows a blotter with JSMITH's own trades already on it.
    /// </summary>
    private static readonly (string Username, string DisplayName, string TraderCode, Role Role)[] Accounts =
    [
        ("jsmith", "J. Smith", "JSMITH", Role.Trader),
        ("abrown", "A. Brown", "ABROWN", Role.Trader),
        ("mjones", "M. Jones", "MJONES", Role.Admin),
        ("viewer", "Read Only", "VIEWER", Role.Viewer),
    ];

    /// <summary>Creates the accounts if, and only if, there are none, so a changed password never reaches a populated database.</summary>
    /// <param name="cancellationToken">Cancels the seed.</param>
    /// <returns>How many accounts were created.</returns>
    public async Task<int> SeedIfEmptyAsync(CancellationToken cancellationToken)
    {
        if (await db.Users.AnyAsync(cancellationToken))
        {
            LogSkipped(logger);
            return 0;
        }

        var hash = passwords.Hash(settings.SeedUserPassword);
        var now = clock.GetUtcNow();

        db.Users.AddRange(Accounts.Select(account => new UserRow
        {
            Id = Guid.CreateVersion7(now),
            Username = account.Username,
            PasswordHash = hash,
            DisplayName = account.DisplayName,
            TraderCode = account.TraderCode,
            Role = account.Role,
            CreatedAt = now,
            UpdatedAt = now,
        }));
        await db.SaveChangesAsync(cancellationToken);

        LogSeeded(logger, string.Join(", ", Accounts.Select(account => account.Username)));
        return Accounts.Length;
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Seeded demo accounts {Usernames} with a shared password")]
    private static partial void LogSeeded(ILogger logger, string usernames);

    [LoggerMessage(Level = LogLevel.Information, Message = "Accounts exist, so the seed was skipped and existing passwords kept")]
    private static partial void LogSkipped(ILogger logger);
}
