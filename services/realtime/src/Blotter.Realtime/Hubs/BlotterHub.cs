using Blotter.Realtime.Marks;
using Blotter.Realtime.Telemetry;
using Microsoft.AspNetCore.SignalR;

namespace Blotter.Realtime.Hubs;

/// <summary>
/// The hub blotter clients connect to. It carries broadcasts only: clients invoke nothing, because
/// mutations go over HTTP where they get validation, error handling and rate limits. A client that
/// connects is sent the current marks straight away, so it can price positions before the first tick.
/// </summary>
/// <param name="marks">Where the current marks are read from.</param>
/// <param name="metrics">Tracks how many clients are connected.</param>
internal sealed class BlotterHub(MarkStore marks, RealtimeMetrics metrics) : Hub
{
    /// <summary>The path the hub is served on.</summary>
    public const string Path = "/hubs/blotter";

    /// <inheritdoc />
    public override async Task OnConnectedAsync()
    {
        metrics.Connected.Add(1);
        await Clients.Caller.SendAsync(HubEvents.MarkUpdated, await marks.CurrentAsync(), Context.ConnectionAborted);
        await base.OnConnectedAsync();
    }

    /// <inheritdoc />
    public override Task OnDisconnectedAsync(Exception? exception)
    {
        metrics.Connected.Add(-1);
        return base.OnDisconnectedAsync(exception);
    }
}
