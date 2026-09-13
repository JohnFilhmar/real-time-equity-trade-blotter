import type { MarkSet } from '@blotter/shared';
import type { TradeBroadcaster } from '../../interfaces/trade_broadcaster.js';
import type { MarkStore } from './mark_store.js';

/** How the feed paces itself. */
export interface MarkFeedOptions {
  /** Gap between two ticks, in milliseconds. */
  interval_ms: number;
}

/** A running simulation of market prices moving. */
export interface MarkFeed {
  /** Schedules the ticks. Calling this twice is a no-op. */
  start(): void;

  /** Cancels the ticks. The feed can be started again afterwards. */
  stop(): void;
}

/** The level below which a name is walked with the wider drift. */
const low_price_threshold = 20;

/** Drift bound, as a fraction, for a mark at or above the threshold. */
const drift_at_or_above = 0.0011;

/** Drift bound, as a fraction, for a mark below the threshold. */
const drift_below = 0.0018;

/** The lowest a mark can go. */
const floor = 0.01;

/**
 * Walks one mark by a random step inside its drift bound.
 *
 * The bounds are the prototype's: 0.11% either way for a name at or above 20, 0.18% below, so a
 * cheap name visibly moves without a dear one jumping. The result is rounded to the cent and then
 * floored, in that order, so rounding cannot produce a zero.
 *
 * @param mark - The current mark.
 * @returns The next mark, to two decimals and never below 0.01.
 */
function step(mark: number): number {
  const bound = mark >= low_price_threshold ? drift_at_or_above : drift_below;
  const drift = (Math.random() - 0.5) * 2 * bound;
  const rounded = Math.round(mark * (1 + drift) * 100) / 100;
  return Math.max(floor, rounded);
}

/**
 * Simulates market prices moving so positions can be marked without a real feed.
 *
 * Every tick walks each symbol's mark, writes the whole set to the store and broadcasts it. The
 * store is written before the broadcast, so a client connecting between the two reads the same set
 * everyone else was just sent.
 *
 * @param store - Where the current marks live.
 * @param broadcaster - Real-time port.
 * @param options - Pacing.
 * @returns A feed that is not yet running.
 */
export function create_mark_feed(
  store: MarkStore,
  broadcaster: TradeBroadcaster,
  options: MarkFeedOptions,
): MarkFeed {
  let timer: NodeJS.Timeout | null = null;

  /**
   * Moves every mark once and announces the result.
   */
  function tick(): void {
    const next: MarkSet = Object.fromEntries(
      Object.entries(store.current()).map(([symbol, mark]) => [symbol, step(mark)]),
    );

    store.set(next);
    broadcaster.marks_updated(next);
  }

  return {
    start(): void {
      if (timer !== null) {
        return;
      }

      timer = setInterval(tick, options.interval_ms);

      // Never let the ticker hold the process open while it is shutting down.
      timer.unref();
    },

    stop(): void {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    },
  };
}
