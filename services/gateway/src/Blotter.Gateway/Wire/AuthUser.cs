using System.Text.Json.Serialization;
using Blotter.Contracts.Reference;
using Blotter.Contracts.Wire;
using Blotter.Gateway.Data;

namespace Blotter.Gateway.Wire;

/// <summary>
/// The signed-in user as the client sees them, matching <c>auth_user_schema</c>. Permissions travel
/// with the user so the interface can hide what the person cannot do; the server re-checks them on
/// every request regardless.
/// </summary>
/// <param name="Id">Account uuid.</param>
/// <param name="Username">Login name.</param>
/// <param name="DisplayName">Name shown in the interface.</param>
/// <param name="TraderCode">Desk code.</param>
/// <param name="Role">Coarse role.</param>
/// <param name="Permissions">What the role may do, in the shared package's order.</param>
internal sealed record AuthUser(
    [property: JsonPropertyName("id")] Guid Id,
    [property: JsonPropertyName("username")] string Username,
    [property: JsonPropertyName("displayName")] string DisplayName,
    [property: JsonPropertyName("traderCode")] string TraderCode,
    [property: JsonPropertyName("role")] Role Role,
    [property: JsonPropertyName("permissions")] IReadOnlyList<string> Permissions)
{
    /// <summary>The only path from a stored account to a response, so the password hash cannot leak by accident.</summary>
    /// <param name="user">The stored account.</param>
    /// <returns>The user as the client sees them.</returns>
    public static AuthUser From(UserRow user) =>
        new(user.Id, user.Username, user.DisplayName, user.TraderCode, user.Role, RolePermissions.For(user.Role));
}
