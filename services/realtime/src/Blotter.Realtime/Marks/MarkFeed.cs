using Blotter.Realtime.Broadcasting;
using Blotter.Realtime.Settings;
using StackExchange.Redis;

namespace Blotter.Realtime.Marks;

/// <summary>
/// Moves every mark once a tick, stores the set, then broadcasts it, in that order, so a client that
/// connects between the two reads the set everyone was just sent. Only one replica ticks at a time:
/// each tick renews a short Redis lease, and a replica that does not hold it stays quiet, so two
/// replicas never broadcast two different mark sets.
/// </summary>
/// <param name="store">Where the marks live.</param>
/// <param name="broadcaster">Sends the set to every client.</param>
/// <param name="redis">Holds the lease.</param>
/// <param name="settings">The tick interval.</param>
/// <param name="clock">The clock ticks run on.</param>
/// <param name="logger">Where failures are reported.</param>
internal sealed partial class MarkFeed(
    MarkStore store,
    TradeBroadcaster broadcaster,
    IConnectionMultiplexer redis,
    RealtimeSettings settings,
    TimeProvider clock,
    ILogger<MarkFeed> logger) : BackgroundService
{
    /// <summary>The Redis key of the lease that decides which replica ticks.</summary>
    public const string LeaseKey = "realtime:marks:lease";

    /// <summary>Takes the lease when it is free and renews it when this replica already holds it, atomically.</summary>
    private const string LeaseScript = """
        if redis.call('GET', KEYS[1]) == ARGV[1] then
          redis.call('PEXPIRE', KEYS[1], ARGV[2])
          return 1
        end
        if redis.call('SET', KEYS[1], ARGV[1], 'NX', 'PX', ARGV[2]) then
          return 1
        end
        return 0
        """;

    private readonly string instance = Guid.NewGuid().ToString("N");

    /// <summary>Moves the marks once if this replica holds the lease. Exposed so tests can tick without a timer.</summary>
    /// <param name="cancellationToken">Stops the broadcast.</param>
    /// <returns>True when this replica ticked, false when another holds the lease.</returns>
    internal async Task<bool> TickAsync(CancellationToken cancellationToken)
    {
        var leaseMs = (settings.MarkIntervalMs * 3).ToString(System.Globalization.CultureInfo.InvariantCulture);
        var held = (int)await redis.GetDatabase().ScriptEvaluateAsync(LeaseScript, [LeaseKey], [instance, leaseMs]);
        if (held != 1)
        {
            return false;
        }

        var next = (await store.CurrentAsync()).ToDictionary(pair => pair.Key, pair => MarkBook.Step(pair.Value, Random.Shared), StringComparer.Ordinal);
        await store.SetAsync(next);
        await broadcaster.BroadcastMarksAsync(next, cancellationToken);
        return true;
    }

    /// <inheritdoc />
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromMilliseconds(settings.MarkIntervalMs), clock);

        try
        {
            while (await timer.WaitForNextTickAsync(stoppingToken))
            {
                try
                {
                    await TickAsync(stoppingToken);
                }
#pragma warning disable CA1031 // Simulated market data must never take the service down.
                catch (Exception error) when (!stoppingToken.IsCancellationRequested)
#pragma warning restore CA1031
                {
                    LogTickFailed(logger, error);
                }
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Shutting down.
        }
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Mark tick failed")]
    private static partial void LogTickFailed(ILogger logger, Exception error);
}
