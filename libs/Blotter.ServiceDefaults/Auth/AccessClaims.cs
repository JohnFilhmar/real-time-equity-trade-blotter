using System.Security.Claims;
using Blotter.Contracts.Json;
using Blotter.Contracts.Reference;
using Blotter.Contracts.Wire;

namespace Blotter.ServiceDefaults.Auth;

/// <summary>
/// The verified contents of an access token. A valid signature only proves the gateway issued the
/// token, not that it still has the shape this code expects, so <see cref="From"/> checks every
/// claim instead of trusting them.
/// </summary>
/// <param name="UserId">The <c>sub</c> claim, the account's uuid.</param>
/// <param name="Username">The account's login name.</param>
/// <param name="TraderCode">The desk code trades are booked and judged under.</param>
/// <param name="Role">The coarse role permissions are derived from.</param>
public sealed record AccessClaims(Guid UserId, string Username, string TraderCode, Role Role)
{
    /// <summary>Claim carrying the user id.</summary>
    public const string SubjectClaim = "sub";

    /// <summary>Claim carrying the username.</summary>
    public const string UsernameClaim = "username";

    /// <summary>Claim carrying the desk code.</summary>
    public const string TraderCodeClaim = "trader_code";

    /// <summary>Claim carrying the role's wire name, such as <c>TRADER</c>.</summary>
    public const string RoleClaim = "role";

    /// <summary>Reads and checks the claims on an authenticated principal.</summary>
    /// <param name="principal">The principal the JWT bearer handler built, with inbound claim mapping off.</param>
    /// <returns>The claims, or null when any of them is missing or malformed.</returns>
    public static AccessClaims? From(ClaimsPrincipal? principal)
    {
        if (principal is null)
        {
            return null;
        }

        var subject = principal.FindFirst(SubjectClaim)?.Value;
        var username = principal.FindFirst(UsernameClaim)?.Value;
        var traderCode = principal.FindFirst(TraderCodeClaim)?.Value;
        var role = principal.FindFirst(RoleClaim)?.Value;

        return Guid.TryParseExact(subject, "D", out var userId)
            && !string.IsNullOrEmpty(username)
            && !string.IsNullOrEmpty(traderCode)
            && WireNames.TryParse<Role>(role, out var parsedRole)
                ? new AccessClaims(userId, username, traderCode, parsedRole)
                : null;
    }

    /// <summary>Checks one permission against the token's role.</summary>
    /// <param name="permission">A value from <see cref="Permissions"/>.</param>
    /// <returns>True when the role carries it.</returns>
    public bool Can(string permission) => RolePermissions.Has(Role, permission);
}
