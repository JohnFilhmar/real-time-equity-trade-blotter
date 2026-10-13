using System.Threading.Channels;

namespace Blotter.Trades.Outbox;

/// <summary>
/// Wakes the dispatcher the moment a write commits, so a broadcast leaves within milliseconds instead
/// of waiting for the next poll. Notifications coalesce: ten writes before the dispatcher wakes are
/// one wake-up, and the dispatcher then drains everything pending.
/// </summary>
internal sealed class OutboxSignal
{
    private readonly Channel<bool> channel = Channel.CreateBounded<bool>(
        new BoundedChannelOptions(1) { FullMode = BoundedChannelFullMode.DropWrite });

    /// <summary>Records that something new is waiting. Never blocks.</summary>
    public void Notify() => channel.Writer.TryWrite(true);

    /// <summary>Waits for a notification or the timeout, whichever comes first.</summary>
    /// <param name="timeout">The longest to wait, which bounds how stale a missed notification can get.</param>
    /// <param name="cancellationToken">Stops the wait when the service shuts down.</param>
    /// <returns>A task that completes on either.</returns>
    public async Task WaitAsync(TimeSpan timeout, CancellationToken cancellationToken)
    {
        using var expiry = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        expiry.CancelAfter(timeout);

        try
        {
            await channel.Reader.ReadAsync(expiry.Token);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            // The timeout elapsed with nothing new, which is the poll.
        }
    }
}
