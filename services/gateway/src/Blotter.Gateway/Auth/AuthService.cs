using Blotter.Contracts.Wire;
using Blotter.Gateway.Data;
using Blotter.Gateway.Http;
using Blotter.Gateway.Settings;
using Blotter.Gateway.Wire;
using Microsoft.EntityFrameworkCore;

namespace Blotter.Gateway.Auth;

/// <summary>What a successful login or refresh produces: the session body and the refresh token for the cookie.</summary>
/// <param name="Session">What the client receives in the body.</param>
/// <param name="RefreshToken">What goes in the httpOnly cookie, never the body.</param>
internal sealed record AuthResult(AuthSession Session, string RefreshToken);

/// <summary>
/// Sign-in and the session lifecycle, ported from the Node API's <c>auth_service.ts</c>. Every
/// failure a client sees is worded so it cannot tell a missing account from a wrong password.
/// </summary>
/// <param name="db">The identity database.</param>
/// <param name="passwords">bcrypt.</param>
/// <param name="tokens">Signs and verifies tokens.</param>
/// <param name="refreshStore">Tracks session families.</param>
/// <param name="attempts">Per-account failure counter.</param>
/// <param name="settings">The access-token lifetime.</param>
/// <param name="clock">Stamps a rehashed row.</param>
/// <param name="logger">Records sign-ins, failures and replays, never passwords or tokens.</param>
internal sealed partial class AuthService(
    IdentityDbContext db,
    PasswordHasher passwords,
    TokenService tokens,
    RefreshStore refreshStore,
    LoginAttempts attempts,
    GatewaySettings settings,
    TimeProvider clock,
    ILogger<AuthService> logger)
{
    private const string NotValid = "The refresh token is not valid";

    /// <summary>
    /// Exchanges credentials for a session. A correct password whose hash was made at another cost is
    /// rehashed before the session is issued, best effort.
    /// </summary>
    /// <param name="username">The trimmed username.</param>
    /// <param name="password">The password as typed.</param>
    /// <param name="cancellationToken">Cancels the lookup.</param>
    /// <returns>The session and its refresh token.</returns>
    /// <exception cref="ApiProblem">A 401 for any credential failure, a 429 when the account is locked, including on the failure that locks it.</exception>
    public async Task<AuthResult> LoginAsync(string username, string password, CancellationToken cancellationToken)
    {
        var lockedFor = await attempts.SecondsLockedAsync(username);
        if (lockedFor > 0)
        {
            throw ApiProblem.LockedOut(lockedFor);
        }

        var user = await db.Users.AsNoTracking().SingleOrDefaultAsync(row => row.Username == username, cancellationToken);
        var matched = PasswordHasher.Verify(password, user?.PasswordHash ?? passwords.DummyHash);

        if (user is null || !matched)
        {
            await attempts.RecordFailureAsync(username);
            LogLoginFailed(logger, username);

            // Read after recording, so the failure that reaches the limit answers with the lock itself.
            var lockedNow = await attempts.SecondsLockedAsync(username);
            throw lockedNow > 0 ? ApiProblem.LockedOut(lockedNow) : ApiProblem.Unauthenticated("Username or password is incorrect");
        }

        await attempts.ClearAsync(username);
        await RehashIfOutdatedAsync(user, password, cancellationToken);

        var family = Guid.NewGuid();
        var (result, tokenId) = Issue(user, family);
        await refreshStore.StartAsync(family, tokenId);

        LogLoginSucceeded(logger, user.Id, user.Role);
        return result;
    }

    /// <summary>Exchanges a refresh token for a new session, rotating it.</summary>
    /// <param name="refreshToken">The cookie value, if any.</param>
    /// <param name="cancellationToken">Cancels the lookup.</param>
    /// <returns>The new session and its replacement refresh token.</returns>
    /// <exception cref="ApiProblem">A 401 when the token is missing, expired, forged, or already used.</exception>
    public async Task<AuthResult> RefreshAsync(string? refreshToken, CancellationToken cancellationToken)
    {
        if (string.IsNullOrEmpty(refreshToken))
        {
            throw ApiProblem.Unauthenticated("No refresh token was supplied");
        }

        var claims = await tokens.ValidateRefreshAsync(refreshToken) ?? throw ApiProblem.Unauthenticated(NotValid);
        var user = await db.Users.AsNoTracking().SingleOrDefaultAsync(row => row.Id == claims.UserId, cancellationToken);

        if (user is null)
        {
            await refreshStore.RevokeAsync(claims.Family);
            throw ApiProblem.Unauthenticated(NotValid);
        }

        var (result, tokenId) = Issue(user, claims.Family);
        var outcome = await refreshStore.RotateAsync(claims.Family, claims.TokenId, tokenId);

        if (outcome == RefreshOutcome.Reused)
        {
            LogReuseDetected(logger, user.Id, claims.Family);
        }

        return outcome == RefreshOutcome.Rotated ? result : throw ApiProblem.Unauthenticated(NotValid);
    }

    /// <summary>Ends the session family the token belongs to. Succeeds whatever the token, so logout cannot fail.</summary>
    /// <param name="refreshToken">The cookie value, if any.</param>
    /// <returns>A task that completes once the family is gone.</returns>
    public async Task LogoutAsync(string? refreshToken)
    {
        if (!string.IsNullOrEmpty(refreshToken) && await tokens.ValidateRefreshAsync(refreshToken) is { } claims)
        {
            await refreshStore.RevokeAsync(claims.Family);
        }
    }

    /// <summary>Reads the user behind an access token.</summary>
    /// <param name="userId">The token's subject.</param>
    /// <param name="cancellationToken">Cancels the lookup.</param>
    /// <returns>The user as the client sees them.</returns>
    /// <exception cref="ApiProblem">A 401 when the account has gone since the token was issued.</exception>
    public async Task<AuthUser> CurrentUserAsync(Guid userId, CancellationToken cancellationToken)
    {
        var user = await db.Users.AsNoTracking().SingleOrDefaultAsync(row => row.Id == userId, cancellationToken)
            ?? throw ApiProblem.Unauthenticated("The account on this token no longer exists");
        return AuthUser.From(user);
    }

    private (AuthResult Result, Guid TokenId) Issue(UserRow user, Guid family)
    {
        var (refreshToken, tokenId) = tokens.IssueRefresh(user.Id, family);
        var session = new AuthSession(tokens.IssueAccess(user), settings.AccessTokenTtlSeconds, AuthUser.From(user));
        return (new AuthResult(session, refreshToken), tokenId);
    }

    /// <summary>Stores a fresh hash when the stored one was made at another cost. Only runs after a proven password.</summary>
    private async Task RehashIfOutdatedAsync(UserRow user, string password, CancellationToken cancellationToken)
    {
        if (!passwords.NeedsRehash(user.PasswordHash))
        {
            return;
        }

        try
        {
            var hash = passwords.Hash(password);
            await db.Users
                .Where(row => row.Id == user.Id)
                .ExecuteUpdateAsync(set => set.SetProperty(row => row.PasswordHash, hash).SetProperty(row => row.UpdatedAt, clock.GetUtcNow()), cancellationToken);
        }
#pragma warning disable CA1031 // Best effort: the old hash still verifies, so a failed rehash must not fail the sign-in.
        catch (Exception error)
#pragma warning restore CA1031
        {
            LogRehashFailed(logger, error, user.Id);
        }
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Login failed for {Username}")]
    private static partial void LogLoginFailed(ILogger logger, string username);

    [LoggerMessage(Level = LogLevel.Information, Message = "Login succeeded for {UserId} as {Role}")]
    private static partial void LogLoginSucceeded(ILogger logger, Guid userId, Role role);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Refresh token reuse detected for {UserId} in family {Family}; the family is revoked")]
    private static partial void LogReuseDetected(ILogger logger, Guid userId, Guid family);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Password rehash failed for {UserId}")]
    private static partial void LogRehashFailed(ILogger logger, Exception error, Guid userId);
}
