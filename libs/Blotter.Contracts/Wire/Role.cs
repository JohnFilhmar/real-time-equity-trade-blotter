using System.Text.Json.Serialization;

namespace Blotter.Contracts.Wire;

/// <summary>
/// Coarse role gates. Authorisation decides on a permission from
/// <see cref="Reference.RolePermissions"/>, never on a role directly. Serialised as <c>VIEWER</c>,
/// <c>TRADER</c> or <c>ADMIN</c>.
/// </summary>
[JsonConverter(typeof(JsonStringEnumConverter<Role>))]
public enum Role
{
    /// <summary>Reads the blotter and nothing else.</summary>
    [JsonStringEnumMemberName("VIEWER")]
    Viewer,

    /// <summary>Books trades and amends or cancels their own.</summary>
    [JsonStringEnumMemberName("TRADER")]
    Trader,

    /// <summary>Everything a trader can do, on anyone's trades.</summary>
    [JsonStringEnumMemberName("ADMIN")]
    Admin,
}
