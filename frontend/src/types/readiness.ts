/** Whether the API said it can serve, and how long it took to say so. */
export interface Readiness {
  state: 'ready' | 'unavailable';
  /** Round trip of the probe in whole milliseconds. */
  latency_ms: number;
}
