using System.Text;
using Microsoft.IdentityModel.Tokens;

namespace Blotter.ServiceDefaults.Auth;

/// <summary>
/// The rules every service applies to an access token. The gateway signs tokens with these and
/// the trades and realtime services verify them with the same ones, so a token is either valid
/// everywhere or nowhere.
/// </summary>
public static class AccessTokens
{
    /// <summary>The <c>iss</c> claim, unchanged from the Node API so existing clients see the same token.</summary>
    public const string Issuer = "blotter-api";

    /// <summary>The <c>aud</c> claim.</summary>
    public const string Audience = "blotter-client";

    /// <summary>The shortest signing secret any service will boot with. Thirty-two bytes is the floor for HS256.</summary>
    public const int MinimumSecretLength = 32;

    /// <summary>
    /// Builds the parameters a token is checked against. The algorithm is pinned to HS256 so a token
    /// cannot choose its own, and clock skew is zero, as it was in the Node API, so a token is dead at
    /// its <c>exp</c>.
    /// </summary>
    /// <param name="secret">The signing secret shared by the services that handle this kind of token.</param>
    /// <returns>Validation parameters for <c>JsonWebTokenHandler</c> or the JWT bearer handler.</returns>
    public static TokenValidationParameters ValidationParameters(string secret) => new()
    {
        ValidIssuer = Issuer,
        ValidAudience = Audience,
        ValidateIssuer = true,
        ValidateAudience = true,
        ValidateLifetime = true,
        RequireExpirationTime = true,
        ClockSkew = TimeSpan.Zero,
        ValidateIssuerSigningKey = true,
        IssuerSigningKey = SigningKey(secret),
        ValidAlgorithms = [SecurityAlgorithms.HmacSha256],
        NameClaimType = AccessClaims.UsernameClaim,
        RoleClaimType = AccessClaims.RoleClaim,
    };

    /// <summary>Wraps a secret as an HMAC key, reading it as UTF-8 bytes exactly as <c>jsonwebtoken</c> did.</summary>
    /// <param name="secret">The signing secret.</param>
    /// <returns>The key.</returns>
    public static SymmetricSecurityKey SigningKey(string secret) => new(Encoding.UTF8.GetBytes(secret));
}
