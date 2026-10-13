using System.Text.Json;
using Blotter.Contracts.Messages;
using Blotter.Trades.Data;
using Blotter.Trades.Domain;
using Blotter.Trades.Services;
using Microsoft.EntityFrameworkCore;

namespace Blotter.Trades.Outbox;

/// <summary>
/// Publishes committed changes from the outbox to the broker, oldest first, then stamps them
/// published. A change committed while the broker is down waits in the outbox and goes out when it
/// returns, so no committed write is ever lost on the way to the clients. Delivery is at least once:
/// a crash between the confirm and the stamp republishes that one message, which is harmless because
/// every message carries whole rows.
/// </summary>
/// <param name="scopes">Creates a database scope per pass.</param>
/// <param name="publisher">The broker connection.</param>
/// <param name="signal">Wakes the dispatcher after each commit.</param>
/// <param name="clock">The clock publish times are read from.</param>
/// <param name="logger">Where failures are reported.</param>
internal sealed partial class OutboxDispatcher(
    IServiceScopeFactory scopes,
    RabbitPublisher publisher,
    OutboxSignal signal,
    TimeProvider clock,
    ILogger<OutboxDispatcher> logger) : BackgroundService
{
    private const int BatchSize = 100;

    /// <summary>The longest a change waits if its wake-up was missed.</summary>
    private static readonly TimeSpan Poll = TimeSpan.FromSeconds(1);

    /// <summary>How long a published row is kept before the clean-up deletes it.</summary>
    private static readonly TimeSpan Retention = TimeSpan.FromHours(24);

    private static readonly TimeSpan CleanupInterval = TimeSpan.FromHours(1);

    private DateTimeOffset lastCleanup = DateTimeOffset.MinValue;

    /// <summary>
    /// Publishes everything pending, in id order, until the outbox is empty. Each message carries the
    /// symbol's position as committed at publish time, so later messages never carry an older position.
    /// </summary>
    /// <param name="cancellationToken">Stops the pass.</param>
    /// <returns>How many messages were published.</returns>
    internal async Task<int> DispatchPendingAsync(CancellationToken cancellationToken)
    {
        var published = 0;

        while (true)
        {
            using var scope = scopes.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<TradesDbContext>();
            var trades = scope.ServiceProvider.GetRequiredService<TradeService>();

            var batch = await db.Outbox
                .AsNoTracking()
                .Where(message => message.PublishedAt == null)
                .OrderBy(message => message.Id)
                .Take(BatchSize)
                .ToListAsync(cancellationToken);

            if (batch.Count == 0)
            {
                return published;
            }

            foreach (var row in batch)
            {
                if (await TryBuildAsync(row, trades, cancellationToken) is { } message)
                {
                    await publisher.PublishAsync(row.Id, message, cancellationToken);
                    published++;
                }

                var now = Timestamps.Now(clock);
                await db.Outbox
                    .Where(message => message.Id == row.Id)
                    .ExecuteUpdateAsync(set => set.SetProperty(message => message.PublishedAt, now), cancellationToken);
            }
        }
    }

    /// <inheritdoc />
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var failures = 0;

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await DispatchPendingAsync(stoppingToken);
                await CleanUpAsync(stoppingToken);
                failures = 0;
                await signal.WaitAsync(Poll, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
#pragma warning disable CA1031 // The dispatcher must outlive a broker or database outage; it retries.
            catch (Exception error)
#pragma warning restore CA1031
            {
                failures++;
                LogDispatchFailed(logger, error, failures);
                await Task.Delay(Backoff(failures), clock, stoppingToken);
            }
        }
    }

    private static TimeSpan Backoff(int failures) => TimeSpan.FromSeconds(Math.Min(30, Math.Pow(2, Math.Min(failures, 5))));

    private async Task<TradeChanged?> TryBuildAsync(OutboxRow row, TradeService trades, CancellationToken cancellationToken)
    {
        OutboxPayload payload;
        try
        {
            payload = OutboxPayload.FromJson(row.Payload);
        }
        catch (JsonException error)
        {
            // Unreadable rows are stamped and skipped, so one bad row cannot stall every broadcast behind it.
            LogUnreadable(logger, error, row.Id);
            return null;
        }

        var position = await trades.PositionForAsync(payload.Trade.Symbol, cancellationToken);
        return new TradeChanged(payload.Kind, payload.Trade, payload.Event, position);
    }

    private async Task CleanUpAsync(CancellationToken cancellationToken)
    {
        var now = clock.GetUtcNow();
        if (now - lastCleanup < CleanupInterval)
        {
            return;
        }

        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<TradesDbContext>();
        var cutoff = now - Retention;
        await db.Outbox.Where(message => message.PublishedAt < cutoff).ExecuteDeleteAsync(cancellationToken);
        lastCleanup = now;
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Outbox dispatch failed, attempt {Failures}; retrying")]
    private static partial void LogDispatchFailed(ILogger logger, Exception error, int failures);

    [LoggerMessage(Level = LogLevel.Error, Message = "Outbox row {OutboxId} has an unreadable payload and was skipped")]
    private static partial void LogUnreadable(ILogger logger, Exception error, long outboxId);
}
