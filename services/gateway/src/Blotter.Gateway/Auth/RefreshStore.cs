using System.Globalization;
using Blotter.Gateway.Settings;
using StackExchange.Redis;

namespace Blotter.Gateway.Auth;

/// <summary>What happened when a refresh token was presented.</summary>
internal enum RefreshOutcome
{
    /// <summary>The token was the family's current one and has been replaced.</summary>
    Rotated,

    /// <summary>An already rotated token came back: a stolen copy or a replay. The family is gone.</summary>
    Reused,

    /// <summary>The family has expired or was logged out.</summary>
    Unknown,
}

/// <summary>
/// Tracks the one valid refresh token of each session family in Redis, under a key that expires
/// with the refresh lifetime. A Redis restart therefore signs everybody out, which is a lost
/// session rather than lost data.
/// </summary>
/// <param name="redis">The shared connection.</param>
/// <param name="settings">The refresh lifetime.</param>
internal sealed class RefreshStore(IConnectionMultiplexer redis, GatewaySettings settings)
{
    /// <summary>
    /// Compares and swaps the family's current token id in one step. A read-then-write would let two
    /// requests carrying the same token both rotate, which is exactly the replay this exists to catch.
    /// </summary>
    private const string RotateScript = """
        local current = redis.call('GET', KEYS[1])
        if current == false then
          return 'unknown'
        end
        if current ~= ARGV[1] then
          redis.call('DEL', KEYS[1])
          return 'reused'
        end
        redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
        return 'rotated'
        """;

    /// <summary>Records the first token of a new family, at login.</summary>
    /// <param name="family">The new family.</param>
    /// <param name="tokenId">The id of the token just issued.</param>
    /// <returns>A task that completes once Redis has it.</returns>
    public Task StartAsync(Guid family, Guid tokenId) =>
        redis.GetDatabase().StringSetAsync(Key(family), tokenId.ToString(), TimeSpan.FromSeconds(settings.RefreshTokenTtlSeconds));

    /// <summary>Exchanges the presented token for the next one, or revokes the family on replay.</summary>
    /// <param name="family">The family the token claims to belong to.</param>
    /// <param name="presented">The id carried by the presented token.</param>
    /// <param name="next">The id of its replacement.</param>
    /// <returns>What happened.</returns>
    public async Task<RefreshOutcome> RotateAsync(Guid family, Guid presented, Guid next)
    {
        var result = (string?)await redis.GetDatabase().ScriptEvaluateAsync(
            RotateScript,
            [Key(family)],
            [presented.ToString(), next.ToString(), settings.RefreshTokenTtlSeconds.ToString(CultureInfo.InvariantCulture)]);

        return result switch
        {
            "rotated" => RefreshOutcome.Rotated,
            "reused" => RefreshOutcome.Reused,
            "unknown" => RefreshOutcome.Unknown,
            _ => throw new InvalidOperationException($"refresh rotation returned an unexpected result: {result}"),
        };
    }

    /// <summary>Ends a family, at logout or when its account has gone.</summary>
    /// <param name="family">The family.</param>
    /// <returns>A task that completes once the key is gone.</returns>
    public Task RevokeAsync(Guid family) => redis.GetDatabase().KeyDeleteAsync(Key(family));

    private static RedisKey Key(Guid family) => $"refresh:family:{family}";
}
