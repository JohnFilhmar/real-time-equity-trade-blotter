import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { instruments, type Trade, type TradeSide } from '@blotter/shared';
import { create_in_memory_trade_repository } from '../../repositories/in_memory_trade_repository/index.js';
import { create_trade_service } from '../../services/trade_service/index.js';
import { logger } from '../logging/logger.js';
import type { TradeRepository } from '../../interfaces/trade_repository.js';
import { create_live_feed, type LiveFeedOptions } from './live_feed.js';

/** A fixed pace, so a test advances the clock by a known amount rather than guessing. */
const one_second: LiveFeedOptions = { min_interval_ms: 1000, max_interval_ms: 1000, max_active_trades: 10_000 };

/**
 * Builds a feed over an in-memory blotter.
 *
 * Only the trade broadcasts are recorded, one per action, so `sent` counts ticks. The audit and
 * position broadcasts that follow each write are the service's subject, not the feed's.
 *
 * @param repository - Optional repository override, for the failure case and pre-filled books.
 * @param options - Optional pacing and cap override.
 * @returns The feed and the events it caused.
 */
function build_feed(repository: TradeRepository = create_in_memory_trade_repository(), options: LiveFeedOptions = one_second) {
  const sent: string[] = [];
  const service = create_trade_service(repository, {
    trade_created: () => sent.push('trade.created'),
    trade_amended: () => sent.push('trade.amended'),
    trade_cancelled: () => sent.push('trade.cancelled'),
    trade_event_recorded: () => undefined,
    position_updated: () => undefined,
    marks_updated: () => undefined,
  });

  return { feed: create_live_feed(service, repository, options), sent };
}

/**
 * Stores trades straight into the repository, bypassing the service, so a test can start from a
 * book the feed did not build.
 *
 * @param repository - Where to store them.
 * @param per_symbol - How many trades to store for each instrument.
 * @param side - The side every stored trade takes.
 * @param quantity - The size every stored trade takes.
 * @returns The stored trades.
 */
async function fill(repository: TradeRepository, per_symbol: number, side: TradeSide, quantity: number): Promise<Trade[]> {
  const stored: Trade[] = [];
  for (const instrument of instruments) {
    for (let i = 0; i < per_symbol; i += 1) {
      stored.push(
        await repository.create({
          symbol: instrument.symbol,
          side,
          quantity,
          price: 100,
          currency: instrument.currency,
          trader: 'JSMITH',
          book: instrument.book,
          counterparty: 'UBS',
          tradeTimestamp: new Date().toISOString(),
        }),
      );
    }
  }
  return stored;
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
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const failing: TradeRepository = {
      ...create_in_memory_trade_repository(),
      create: async () => {
        throw new Error('database is on fire');
      },
      find_random_active: async (): Promise<Trade | null> => null,
      count_active: async (): Promise<number> => 0,
    };
    const { feed } = build_feed(failing);

    feed.start();
    await vi.advanceTimersByTimeAsync(3000);
    feed.stop();

    expect(warn).toHaveBeenCalledTimes(3);
  });

  it('never lets the book grow past its cap, and still books when there is room', async () => {
    const repository = create_in_memory_trade_repository();
    const cap = 12;
    await fill(repository, 1, 'BUY', 100);
    const { feed, sent } = build_feed(repository, { ...one_second, max_active_trades: cap });

    feed.start();
    for (let tick = 0; tick < 60; tick += 1) {
      await vi.advanceTimersByTimeAsync(1000);
      expect(await repository.count_active()).toBeLessThanOrEqual(cap);
    }
    feed.stop();

    expect(sent).toContain('trade.cancelled');
    expect(sent).toContain('trade.created');
  });

  it('sells into a book that is long, rather than adding to it at random', async () => {
    const repository = create_in_memory_trade_repository();
    const seeded = await fill(repository, 5, 'BUY', 5_000_000);
    const seeded_ids = new Set(seeded.map((trade) => trade.tradeId));
    const { feed } = build_feed(repository);

    feed.start();
    await vi.advanceTimersByTimeAsync(100_000);
    feed.stop();

    const booked = (await repository.find_active_trades()).filter((trade) => !seeded_ids.has(trade.tradeId) && trade.version === 1);
    const buys = booked.filter((trade) => trade.side === 'BUY').length;

    // Without the lean, about half would be buys; with every symbol heavily long, about one in ten.
    expect(booked.length).toBeGreaterThan(20);
    expect(buys).toBeLessThanOrEqual(booked.length / 4);
  });
});
