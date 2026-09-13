import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { instrument_symbols, type MarkSet } from '@blotter/shared';
import type { TradeBroadcaster } from '../../interfaces/trade_broadcaster.js';
import { create_mark_feed, type MarkFeed } from './mark_feed.js';
import { create_mark_store, type MarkStore } from './mark_store.js';

/** A fixed pace, so a test advances the clock by a known amount rather than guessing. */
const interval_ms = 900;

/**
 * Builds a feed over a fresh store and a broadcaster that records each mark set it is handed.
 *
 * @returns The feed, its store, and every set broadcast, in order.
 */
function build_feed(): { feed: MarkFeed; store: MarkStore; sent: MarkSet[] } {
  const store = create_mark_store();
  const sent: MarkSet[] = [];
  const broadcaster: TradeBroadcaster = {
    trade_created: () => undefined,
    trade_amended: () => undefined,
    trade_cancelled: () => undefined,
    trade_event_recorded: () => undefined,
    position_updated: () => undefined,
    marks_updated: (marks) => sent.push(marks),
  };

  return { feed: create_mark_feed(store, broadcaster, { interval_ms }), store, sent };
}

/**
 * The widest step one tick may take from a mark, plus half a cent for the rounding.
 *
 * @param mark - The mark before the tick.
 * @returns The bound, in the mark's own currency.
 */
function drift_bound(mark: number): number {
  return mark * (mark >= 20 ? 0.0011 : 0.0018) + 0.005;
}

describe('mark feed', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('broadcasts nothing before the first interval, then once per interval', () => {
    const { feed, sent } = build_feed();

    feed.start();
    vi.advanceTimersByTime(interval_ms - 1);
    expect(sent).toHaveLength(0);

    vi.advanceTimersByTime(1);
    expect(sent).toHaveLength(1);

    vi.advanceTimersByTime(interval_ms * 3);
    expect(sent).toHaveLength(4);
  });

  it('moves every symbol by no more than its drift bound, to two decimals, and stores what it sent', () => {
    const { feed, store, sent } = build_feed();
    let previous = store.current();

    feed.start();
    for (let tick = 0; tick < 50; tick += 1) {
      vi.advanceTimersByTime(interval_ms);
      const next = sent.at(-1);
      expect(next).toBeDefined();

      for (const symbol of instrument_symbols) {
        const before = previous[symbol] ?? 0;
        const after = next?.[symbol] ?? 0;
        expect(Math.abs(after - before)).toBeLessThanOrEqual(drift_bound(before));
        expect(Math.round(after * 100) / 100).toBe(after);
      }

      expect(store.current()).toEqual(next);
      previous = next ?? previous;
    }
  });

  it('never lets a mark fall below 0.01, even one that would round to nothing', () => {
    const { feed, store, sent } = build_feed();
    store.set({ ...store.current(), AAPL: 0.004 });

    feed.start();
    vi.advanceTimersByTime(interval_ms * 20);

    expect(sent[0]?.AAPL).toBe(0.01);
    for (const marks of sent) {
      expect(marks.AAPL).toBeGreaterThanOrEqual(0.01);
    }
  });

  it('schedules once when started twice', () => {
    const { feed, sent } = build_feed();

    feed.start();
    feed.start();
    vi.advanceTimersByTime(interval_ms * 2);

    expect(sent).toHaveLength(2);
  });

  it('stops ticking once stopped', () => {
    const { feed, sent } = build_feed();

    feed.start();
    vi.advanceTimersByTime(interval_ms);
    feed.stop();
    vi.advanceTimersByTime(interval_ms * 10);

    expect(sent).toHaveLength(1);
  });
});
