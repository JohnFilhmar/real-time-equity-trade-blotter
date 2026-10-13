using Blotter.Contracts.Json;
using Blotter.Contracts.Reference;
using StackExchange.Redis;

namespace Blotter.Realtime.Marks;

/// <summary>
/// The current mark set, in a Redis hash so every replica hands a connecting client the same marks.
/// Nothing is persisted beyond Redis: marks are transient market data, and an empty store reads as
/// every instrument at its reference price.
/// </summary>
/// <param name="redis">The shared connection.</param>
internal sealed class MarkStore(IConnectionMultiplexer redis)
{
    /// <summary>The Redis key of the hash, symbol to exact decimal text.</summary>
    public const string Key = "realtime:marks";

    /// <summary>Reads every mark, in universe order.</summary>
    /// <returns>Symbol to mark.</returns>
    public async Task<IReadOnlyDictionary<string, decimal>> CurrentAsync()
    {
        var stored = await redis.GetDatabase().HashGetAllAsync(Key);
        if (stored.Length == 0)
        {
            return MarkBook.Initial();
        }

        var bySymbol = stored.ToDictionary(entry => entry.Name.ToString(), entry => ExactDecimal.Parse(entry.Value.ToString()), StringComparer.Ordinal);
        return Instruments.All
            .Where(instrument => bySymbol.ContainsKey(instrument.Symbol))
            .ToDictionary(instrument => instrument.Symbol, instrument => bySymbol[instrument.Symbol], StringComparer.Ordinal);
    }

    /// <summary>Replaces the whole set.</summary>
    /// <param name="marks">Every symbol's new mark.</param>
    /// <returns>A task that completes once Redis has the set.</returns>
    public Task SetAsync(IReadOnlyDictionary<string, decimal> marks) =>
        redis.GetDatabase().HashSetAsync(Key, [.. marks.Select(pair => new HashEntry(pair.Key, ExactDecimal.Format(pair.Value)))]);
}
