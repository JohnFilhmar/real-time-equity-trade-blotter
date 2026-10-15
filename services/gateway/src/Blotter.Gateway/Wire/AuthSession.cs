using System.Text.Json.Serialization;

namespace Blotter.Gateway.Wire;

/// <summary>
/// What login and refresh both answer, matching <c>auth_session_schema</c>. The refresh token is
/// not in here: it travels as an httpOnly cookie no script on the page can read.
/// </summary>
/// <param name="AccessToken">The short-lived bearer token.</param>
/// <param name="ExpiresIn">Its lifetime in whole seconds, which the client schedules its refresh from.</param>
/// <param name="User">The signed-in user.</param>
internal sealed record AuthSession(
    [property: JsonPropertyName("accessToken")] string AccessToken,
    [property: JsonPropertyName("expiresIn")] int ExpiresIn,
    [property: JsonPropertyName("user")] AuthUser User);
