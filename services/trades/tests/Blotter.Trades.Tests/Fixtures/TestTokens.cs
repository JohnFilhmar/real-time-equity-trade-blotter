using System.Security.Claims;
using Blotter.Contracts.Json;
using Blotter.Contracts.Wire;
using Blotter.ServiceDefaults.Auth;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace Blotter.Trades.Tests.Fixtures;

/// <summary>Mints access tokens the way the gateway does, signed with the test secret.</summary>
public static class TestTokens
{
    /// <summary>The access-token secret the hosted service is configured with.</summary>
    public const string Secret = "test-access-secret-0123456789abcdefghij";

    /// <summary>Signs an access token.</summary>
    /// <param name="role">The caller's role.</param>
    /// <param name="traderCode">The caller's desk code.</param>
    /// <param name="secret">The secret to sign with. Anything but <see cref="Secret"/> is a forgery.</param>
    /// <param name="lifetime">How long the token lives. Negative makes an expired token.</param>
    /// <returns>A compact JWT.</returns>
    public static string Access(Role role, string traderCode = "JSMITH", string secret = Secret, TimeSpan? lifetime = null)
    {
        var now = DateTime.UtcNow;
        var expires = now + (lifetime ?? TimeSpan.FromMinutes(15));

        return new JsonWebTokenHandler { SetDefaultTimesOnTokenCreation = false }.CreateToken(new SecurityTokenDescriptor
        {
            Issuer = AccessTokens.Issuer,
            Audience = AccessTokens.Audience,
            IssuedAt = expires < now ? expires.AddMinutes(-1) : now,
            Expires = expires,
            Subject = new ClaimsIdentity(
            [
                new Claim(AccessClaims.SubjectClaim, Guid.NewGuid().ToString()),
                new Claim(AccessClaims.UsernameClaim, traderCode.ToLowerInvariant()),
                new Claim(AccessClaims.TraderCodeClaim, traderCode),
                new Claim(AccessClaims.RoleClaim, WireNames.Of(role)),
            ]),
            SigningCredentials = new SigningCredentials(AccessTokens.SigningKey(secret), SecurityAlgorithms.HmacSha256),
        });
    }
}
