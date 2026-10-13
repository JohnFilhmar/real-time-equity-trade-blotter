using Blotter.Contracts.Wire;

namespace Blotter.Gateway.Data;

/// <summary>
/// A row of <c>app_user</c>. It carries the password hash, which is why it never leaves the auth
/// layer: everything a client sees goes through <c>AuthUser.From</c>.
/// </summary>
internal sealed class UserRow
{
    /// <summary>Account uuid, the access token's <c>sub</c>.</summary>
    public Guid Id { get; set; }

    /// <summary>Login name, unique and case-sensitive, as it was in Postgres.</summary>
    public string Username { get; set; } = string.Empty;

    /// <summary>bcrypt hash, salt included.</summary>
    public string PasswordHash { get; set; } = string.Empty;

    /// <summary>Name shown in the interface.</summary>
    public string DisplayName { get; set; } = string.Empty;

    /// <summary>Desk code trades are booked under. Not a foreign key: trades outlive accounts.</summary>
    public string TraderCode { get; set; } = string.Empty;

    /// <summary>Coarse role, stored as its wire name.</summary>
    public Role Role { get; set; }

    /// <summary>When the account was created.</summary>
    public DateTimeOffset CreatedAt { get; set; }

    /// <summary>When the account last changed.</summary>
    public DateTimeOffset UpdatedAt { get; set; }
}
