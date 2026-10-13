using System.Security.Claims;
using Blotter.Contracts.Json;
using Blotter.Contracts.Wire;
using Blotter.ServiceDefaults.Auth;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace Blotter.Gateway.Tests.Fixtures;

/// <summary>
/// Mints access tokens directly, the C# twin of the Node tests' <c>token_for</c>: a random subject,
/// the desk code lower-cased as the username, and the role. Both services accept them, because both
/// verify with the shared access secret, and no account has to exist behind them.
/// </summary>
public static class TestTokens
{
    /// <summary>Signs an access token.</summary>
    /// <param name="traderCode">The caller's desk code.</param>
    /// <param name="role">The caller's role.</param>
    /// <returns>A compact JWT.</returns>
    public static string For(string traderCode, Role role = Role.Trader) =>
        new JsonWebTokenHandler().CreateToken(new SecurityTokenDescriptor
        {
            Issuer = AccessTokens.Issuer,
            Audience = AccessTokens.Audience,
            Expires = DateTime.UtcNow.AddMinutes(15),
            Subject = new ClaimsIdentity(
            [
                new Claim(AccessClaims.SubjectClaim, Guid.NewGuid().ToString()),
                new Claim(AccessClaims.UsernameClaim, traderCode.ToLowerInvariant()),
                new Claim(AccessClaims.TraderCodeClaim, traderCode),
                new Claim(AccessClaims.RoleClaim, WireNames.Of(role)),
            ]),
            SigningCredentials = new SigningCredentials(AccessTokens.SigningKey(GatewayEnvironment.AccessSecret), SecurityAlgorithms.HmacSha256),
        });
}
