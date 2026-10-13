using Blotter.Contracts.Wire;

namespace Blotter.Contracts.Reference;

/// <summary>
/// The only place a role turns into permissions, matching <c>role_permissions</c> in
/// <c>shared/src/reference/roles.ts</c>, including the order the frontend receives them in.
/// </summary>
public static class RolePermissions
{
    private static readonly Dictionary<Role, IReadOnlyList<string>> Map = new()
    {
        [Role.Viewer] = [Permissions.TradeRead],
        [Role.Trader] = [Permissions.TradeRead, Permissions.TradeCreate, Permissions.TradeAmend, Permissions.TradeCancel],
        [Role.Admin] =
        [
            Permissions.TradeRead,
            Permissions.TradeCreate,
            Permissions.TradeAmend,
            Permissions.TradeAmendAny,
            Permissions.TradeCancel,
            Permissions.TradeCancelAny,
        ],
    };

    /// <summary>Lists what a role may do.</summary>
    /// <param name="role">The role to expand.</param>
    /// <returns>Its permissions, in the order the frontend expects.</returns>
    public static IReadOnlyList<string> For(Role role) => Map[role];

    /// <summary>Checks one permission against a role.</summary>
    /// <param name="role">The role to check.</param>
    /// <param name="permission">A value from <see cref="Permissions"/>.</param>
    /// <returns>True when the role carries the permission.</returns>
    public static bool Has(Role role, string permission) => Map[role].Contains(permission);
}
