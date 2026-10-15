using System.Diagnostics.Metrics;

namespace Blotter.Realtime.Telemetry;

/// <summary>
/// The numbers that say whether the blotter is really real-time, under the names the Node API
/// exported: connected clients, broadcasts per event, broadcast lag, and refused connections.
/// The Prometheus exporter renders them as <c>blotter_socket_clients_connected</c>,
/// <c>blotter_broadcasts_emitted_total</c>, <c>blotter_broadcast_lag_seconds</c> and
/// <c>blotter_socket_connections_rejected_total</c>.
/// </summary>
internal sealed class RealtimeMetrics
{
    /// <summary>The service's meter, which is also its OpenTelemetry service name.</summary>
    public const string MeterName = "Blotter.Realtime";

    /// <summary>Creates the instruments on the service's meter.</summary>
    /// <param name="meters">The host's meter factory, which owns the meter's lifetime.</param>
    public RealtimeMetrics(IMeterFactory meters)
    {
        ArgumentNullException.ThrowIfNull(meters);
        var meter = meters.Create(MeterName);

        Connected = meter.CreateUpDownCounter<long>(
            "blotter.socket.clients.connected",
            description: "Hub clients currently connected");
        Emitted = meter.CreateCounter<long>(
            "blotter.broadcasts.emitted",
            description: "Broadcasts emitted to connected clients, by event name");
        Lag = meter.CreateHistogram(
            "blotter.broadcast.lag",
            unit: "s",
            description: "Seconds between a trade change committing and its broadcast being emitted",
            advice: new InstrumentAdvice<double> { HistogramBucketBoundaries = [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5] });
        Rejected = meter.CreateCounter<long>(
            "blotter.socket.connections.rejected",
            description: "Hub connections refused by the origin, token or permission check");
    }

    /// <summary>Clients connected now. Goes up and down.</summary>
    public UpDownCounter<long> Connected { get; }

    /// <summary>Broadcasts emitted, tagged with the event name.</summary>
    public Counter<long> Emitted { get; }

    /// <summary>Commit-to-emit lag, tagged with the event name.</summary>
    public Histogram<double> Lag { get; }

    /// <summary>Connections refused.</summary>
    public Counter<long> Rejected { get; }
}
