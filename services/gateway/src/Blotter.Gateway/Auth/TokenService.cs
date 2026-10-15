using System.Security.Claims;
using Blotter.Contracts.Json;
using Blotter.Gateway.Data;
using Blotter.Gateway.Settings;
using Blotter.ServiceDefaults.Auth;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace Blotter.Gateway.Auth;

/// <summary>The verified contents of a refresh token.</summary>
/// <param name="UserId">Who it was issued to.</param>
/// <param name="Family">The session family it belongs to. A login starts a new one.</param>
/// <param name="TokenId">Its own id, which the refresh store compares to the family's current one.</param>
internal sealed record RefreshClaims(Guid UserId, Guid Family, Guid TokenId);

/// <summary>
/// Signs access and refresh tokens with separate secrets, HS256 only, issuer <c>blotter-api</c> and
/// audience <c>blotter-client</c>, as the Node API did. Because the secrets differ, a refresh token
/// never verifies as an access token and the other way round.
/// </summary>
/// <param name="settings">The secrets and lifetimes.</param>
/// <param name="clock">The clock tokens are stamped with.</param>
internal sealed class TokenService(GatewaySettings settings, TimeProvider clock)
{
    private readonly JsonWebTokenHandler handler = new() { SetDefaultTimesOnTokenCreation = false, MapInboundClaims = false };

    /// <summary>Signs a short-lived access token carrying the user's id, name, desk code and role.</summary>
    /// <param name="user">The authenticated user.</param>
    /// <returns>The compact token.</returns>
    public string IssueAccess(UserRow user) => Sign(
        settings.JwtAccessSecret,
        settings.AccessTokenTtlSeconds,
        new Claim(AccessClaims.SubjectClaim, user.Id.ToString()),
        new Claim(AccessClaims.UsernameClaim, user.Username),
        new Claim(AccessClaims.TraderCodeClaim, user.TraderCode),
        new Claim(AccessClaims.RoleClaim, WireNames.Of(user.Role)));

    /// <summary>Signs a refresh token in a session family, with a fresh token id.</summary>
    /// <param name="userId">Who it is for.</param>
    /// <param name="family">The family it belongs to.</param>
    /// <returns>The token and its id, which the refresh store records as the family's current one.</returns>
    public (string Token, Guid TokenId) IssueRefresh(Guid userId, Guid family)
    {
        var tokenId = Guid.NewGuid();
        var token = Sign(
            settings.JwtRefreshSecret,
            settings.RefreshTokenTtlSeconds,
            new Claim(AccessClaims.SubjectClaim, userId.ToString()),
            new Claim("family", family.ToString()),
            new Claim("jti", tokenId.ToString()));
        return (token, tokenId);
    }

    /// <summary>
    /// Verifies a refresh token and checks its claims' shape. Every failure is the same null, so a
    /// caller cannot tell a client which of the several reasons applied.
    /// </summary>
    /// <param name="token">The token from the cookie.</param>
    /// <returns>The claims, or null when the token is expired, forged, malformed or an access token.</returns>
    public async Task<RefreshClaims?> ValidateRefreshAsync(string token)
    {
        var parameters = AccessTokens.ValidationParameters(settings.JwtRefreshSecret);
        parameters.LifetimeValidator = (_, expires, _, _) => expires is { } at && at > clock.GetUtcNow().UtcDateTime;

        var result = await handler.ValidateTokenAsync(token, parameters);
        if (!result.IsValid)
        {
            return null;
        }

        return Guid.TryParseExact(Claim(result, AccessClaims.SubjectClaim), "D", out var userId)
            && Guid.TryParseExact(Claim(result, "family"), "D", out var family)
            && Guid.TryParseExact(Claim(result, "jti"), "D", out var tokenId)
                ? new RefreshClaims(userId, family, tokenId)
                : null;
    }

    private static string? Claim(TokenValidationResult result, string name) =>
        result.Claims.TryGetValue(name, out var value) ? value?.ToString() : null;

    private string Sign(string secret, int lifetimeSeconds, params Claim[] claims)
    {
        var now = clock.GetUtcNow().UtcDateTime;
        return handler.CreateToken(new SecurityTokenDescriptor
        {
            Issuer = AccessTokens.Issuer,
            Audience = AccessTokens.Audience,
            IssuedAt = now,
            Expires = now.AddSeconds(lifetimeSeconds),
            Subject = new ClaimsIdentity(claims),
            SigningCredentials = new SigningCredentials(AccessTokens.SigningKey(secret), SecurityAlgorithms.HmacSha256),
        });
    }
}
