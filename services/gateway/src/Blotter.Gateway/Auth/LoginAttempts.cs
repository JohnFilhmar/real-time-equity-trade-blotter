using Blotter.Gateway.Settings;
using StackExchange.Redis;

namespace Blotter.Gateway.Auth;

/// <summary>
/// Counts failed logins per account and locks it after too many. The rate limiter bounds one client;
/// this bounds one account, so an attacker spreading guesses across addresses still meets a wall.
/// Every failure re-arms the expiry, so a steady trickle of guesses keeps the account locked.
/// </summary>
/// <param name="redis">The shared connection.</param>
/// <param name="settings">The attempt limit and the lockout length.</param>
internal sealed class LoginAttempts(IConnectionMultiplexer redis, GatewaySettings settings)
{
    /// <summary>Seconds left on an account's lock.</summary>
    /// <param name="username">The account being tried.</param>
    /// <returns>The seconds remaining, or 0 when it is not locked.</returns>
    public async Task<int> SecondsLockedAsync(string username)
    {
        var database = redis.GetDatabase();
        var count = (long?)await database.StringGetAsync(Key(username));
        if (count is null || count < settings.LoginMaxAttempts)
        {
            return 0;
        }

        var ttl = await database.KeyTimeToLiveAsync(Key(username));
        return ttl is { TotalSeconds: > 0 } left ? (int)Math.Ceiling(left.TotalSeconds) : 0;
    }

    /// <summary>Records a failure, which locks the account once the limit is reached.</summary>
    /// <param name="username">The account that failed.</param>
    /// <returns>A task that completes once Redis has it.</returns>
    public async Task RecordFailureAsync(string username)
    {
        var database = redis.GetDatabase();
        await database.StringIncrementAsync(Key(username));
        await database.KeyExpireAsync(Key(username), TimeSpan.FromSeconds(settings.LoginLockoutSeconds));
    }

    /// <summary>Clears the count after a successful login.</summary>
    /// <param name="username">The account that succeeded.</param>
    /// <returns>A task that completes once the key is gone.</returns>
    public Task ClearAsync(string username) => redis.GetDatabase().KeyDeleteAsync(Key(username));

    /// <summary>Lower-cased, so <c>JSMITH</c> and <c>jsmith</c> cannot be attacked as two budgets.</summary>
    private static RedisKey Key(string username) => $"login:attempts:{username.ToLowerInvariant()}";
}
