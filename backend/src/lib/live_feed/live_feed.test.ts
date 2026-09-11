import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Trade } from '@blotter/shared';
import { create_in_memory_trade_repository } from '../../repositories/in_memory_trade_repository.js';
import { create_trade_service } from '../../services/trade_service.js';
import type { TradeRepository } from '../../interfaces/trade_repository.js';
import { create_live_feed } from './live_feed.js';

/** A fixed pace, so a test advances the clock by a known amount rather than guessing. */
const one_second = { min_interval_ms: 1000, max_interval_ms: 1000 };

/**
 * Builds a feed over an in-memory blotter.
 *
 * @param repository - Optional repository override, for the failure case.
 * @returns The feed and the events it caused.
 */
function build_feed(repository: TradeRepository = create_in_memory_trade_repository()) {
  const sent: string[] = [];
  const service = create_trade_service(repository, {
    trade_created: () => sent.push('trade.created'),
    trade_amended: () => sent.push('trade.amended'),
    trade_cancelled: () => sent.push('trade.cancelled'),
  });

  return { feed: create_live_feed(service, repository, one_second), sent };
}

describe('live feed', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('acts once per tick, booking a trade first because the blotter starts empty', async () => {
    const { feed, sent } = build_feed();

    feed.start();
    await vi.advanceTimersByTimeAsync(3000);
    feed.stop();

    expect(sent).toHaveLength(3);
    expect(sent[0]).toBe('trade.created');
  });

  it('does nothing before it is started', async () => {
    const { sent } = build_feed();

    await vi.advanceTimersByTimeAsync(5000);

    expect(sent).toEqual([]);
  });

  it('stops scheduling once stopped', async () => {
    const { feed, sent } = build_feed();

    feed.start();
    await vi.advanceTimersByTimeAsync(1000);
    feed.stop();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(sent).toHaveLength(1);
  });

  it('amends and cancels existing trades, not only creates them', async () => {
    const { feed, sent } = build_feed();

    feed.start();
    await vi.advanceTimersByTimeAsync(200_000);
    feed.stop();

    expect(new Set(sent)).toEqual(
      new Set(['trade.created', 'trade.amended', 'trade.cancelled']),
    );
  });

  it('keeps running after an unexpected failure', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const failing: TradeRepository = {
      ...create_in_memory_trade_repository(),
      create: async () => {
        throw new Error('database is on fire');
      },
      find_random_active: async (): Promise<Trade | null> => null,
    };
    const { feed } = build_feed(failing);

    feed.start();
    await vi.advanceTimersByTimeAsync(3000);
    feed.stop();

    expect(warn).toHaveBeenCalledTimes(3);
  });
});
