using Blotter.Contracts.Messages;
using Blotter.Realtime.Hubs;
using Blotter.Realtime.Telemetry;
using Microsoft.AspNetCore.SignalR;
using StackExchange.Redis;

namespace Blotter.Realtime.Broadcasting;

/// <summary>
/// Turns a <see cref="TradeChanged"/> message into the hub events the frontend listens for, in the
/// Node API's order: the trade, then its audit row when there is one, then the symbol's position.
/// The three share one sequence, drawn from Redis so every replica of this service numbers from the
/// same counter. Like the Node counter, it restarts when its store does, which the client's resync
/// already handles.
/// </summary>
/// <param name="hub">Sends to every connected client, through the Redis backplane.</param>
/// <param name="redis">Holds the sequence.</param>
/// <param name="clock">Stamps <c>emitted_at</c>.</param>
/// <param name="metrics">Counts broadcasts and measures lag.</param>
internal sealed class TradeBroadcaster(
    IHubContext<BlotterHub> hub,
    IConnectionMultiplexer redis,
    TimeProvider clock,
    RealtimeMetrics metrics)
{
    /// <summary>The Redis key of the shared sequence.</summary>
    public const string SequenceKey = "realtime:seq";

    /// <summary>Broadcasts one committed change as two or three numbered envelopes.</summary>
    /// <param name="message">The change, as the trades service published it.</param>
    /// <param name="cancellationToken">Stops the sends.</param>
    /// <returns>A task that completes once every envelope was handed to the hub.</returns>
    public async Task BroadcastAsync(TradeChanged message, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(message);

        var count = message.Event is null ? 2 : 3;
        var seq = await redis.GetDatabase().StringIncrementAsync(SequenceKey, count) - count + 1;

        var tradeEvent = HubEvents.For(message.Kind);
        var trade = new TradeEnvelope(seq++, Now(), message.Trade);
        ObserveLag(tradeEvent, message.Trade.UpdatedAt, trade.EmittedAt);
        await SendAsync(tradeEvent, trade, cancellationToken);

        if (message.Event is { } recorded)
        {
            var audit = new TradeEventEnvelope(seq++, Now(), recorded);
            ObserveLag(HubEvents.TradeEventRecorded, recorded.OccurredAt, audit.EmittedAt);
            await SendAsync(HubEvents.TradeEventRecorded, audit, cancellationToken);
        }

        // A position is derived rather than committed, so it has no commit time to measure lag from.
        await SendAsync(HubEvents.PositionUpdated, new PositionEnvelope(seq, Now(), message.Position), cancellationToken);
    }

    /// <summary>Broadcasts the whole mark set. Marks are idempotent snapshots, so they travel bare, without a sequence.</summary>
    /// <param name="marks">Every symbol's mark.</param>
    /// <param name="cancellationToken">Stops the send.</param>
    /// <returns>A task that completes once the set was handed to the hub.</returns>
    public Task BroadcastMarksAsync(IReadOnlyDictionary<string, decimal> marks, CancellationToken cancellationToken) =>
        SendAsync(HubEvents.MarkUpdated, marks, cancellationToken);

    private DateTimeOffset Now() => clock.GetUtcNow();

    private async Task SendAsync(string eventName, object payload, CancellationToken cancellationToken)
    {
        await hub.Clients.All.SendAsync(eventName, payload, cancellationToken);
        metrics.Emitted.Add(1, new KeyValuePair<string, object?>("event", eventName));
    }

    private void ObserveLag(string eventName, DateTimeOffset committedAt, DateTimeOffset emittedAt) =>
        metrics.Lag.Record(
            Math.Max((emittedAt - committedAt).TotalSeconds, 0),
            new KeyValuePair<string, object?>("event", eventName));
}
