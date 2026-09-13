import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

/** The registry this process exposes. Its own instance, so a test can build a clean one. */
export const registry = new Registry();

collectDefaultMetrics({ register: registry });

/**
 * How many blotter clients are connected right now.
 *
 * A gauge rather than a counter: it goes down. This is the first of the three numbers that say
 * whether the blotter is actually real-time rather than merely claiming to be.
 */
export const connected_clients = new Gauge({
  name: 'blotter_socket_clients_connected',
  help: 'Number of Socket.IO clients currently connected',
  registers: [registry],
});

/**
 * Every broadcast the server has emitted, labelled by event name. Rate gives events per second.
 *
 * The label takes every name in `trade_events`: the three trade events, `trade_event.recorded`,
 * `position.updated` and `mark.updated`.
 */
export const broadcasts_emitted = new Counter({
  name: 'blotter_broadcasts_emitted_total',
  help: 'Broadcasts emitted to connected clients',
  labelNames: ['event'] as const,
  registers: [registry],
});

/**
 * How long a change takes to reach the wire after it was committed.
 *
 * Measured from the trade's `updatedAt`, or the audit event's `occurredAt`, which the database
 * sets at commit, to the moment the envelope is stamped for emit. That is the number that
 * distinguishes a real-time blotter from one that merely has a socket attached, and buckets rather
 * than an average because the tail is what matters. Positions and marks are derived rather than
 * committed, so they carry no commit time and are not observed here.
 */
export const broadcast_lag_seconds = new Histogram({
  name: 'blotter_broadcast_lag_seconds',
  help: 'Seconds between a trade change committing and its broadcast being emitted',
  labelNames: ['event'] as const,
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
  registers: [registry],
});

/** Socket connections refused because their Origin was not on the allowlist. */
export const rejected_connections = new Counter({
  name: 'blotter_socket_connections_rejected_total',
  help: 'Socket connections refused by the Origin check',
  registers: [registry],
});
