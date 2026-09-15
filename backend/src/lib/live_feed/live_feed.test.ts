import { faker } from '@faker-js/faker';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { instruments, type Trade, type TradeSide } from '@blotter/shared';
import { create_in_memory_trade_repository } from '../../repositories/in_memory_trade_repository/index.js';
import { create_trade_service } from '../../services/trade_service/index.js';
import { logger } from '../logging/logger.js';
import type { TradeRepository } from '../../interfaces/trade_repository.js';
import { recent_amend_window } from './choose_amend_scope.js';
import { create_live_feed, type LiveFeedOptions } from './live_feed.js';

/** A fixed pace, so a test advances the clock by a known amount rather than guessing. */
const one_second: LiveFeedOptions = { min_interval_ms: 1000, max_interval_ms: 1000, max_active_trades: 10_000 };

/** Fixes every random draw in this file, so a failing run can be replayed exactly. */
const test_seed = 20_260_915;

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
    faker.seed(test_seed);
    // The in-memory repository picks its random trade with Math.random. Drawing that from the
    // seeded generator as well makes every run of this file identical.
    vi.spyOn(Math, 'random').mockImplementation(() => faker.number.float({ min: 0, max: 0.999_999 }));
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

  it('draws about half of its amendments from the newest trades and the rest from the whole book', async () => {
    const repository = create_in_memory_trade_repository();
    await fill(repository, 5, 'BUY', 100);
    const recent = vi.spyOn(repository, 'find_random_recent_active');
    const anywhere = vi.spyOn(repository, 'find_random_active');
    const { feed, sent } = build_feed(repository);

    feed.start();
    await vi.advanceTimersByTimeAsync(400_000);
    feed.stop();

    const amended = sent.filter((event) => event === 'trade.amended').length;
    const cancelled = sent.filter((event) => event === 'trade.cancelled').length;

    // Each amendment and each cancel looks for its target once, and a cancel always looks across the
    // whole book, so every recent lookup belongs to an amendment.
    expect(recent.mock.calls.length + anywhere.mock.calls.length).toBe(amended + cancelled);
    expect(recent).toHaveBeenCalledWith(recent_amend_window);
    expect(recent.mock.calls.length).toBeGreaterThan(amended * 0.35);
    expect(recent.mock.calls.length).toBeLessThan(amended * 0.65);
  });

  it('keeps running after an unexpected failure', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const failing: TradeRepository = {
      ...create_in_memory_trade_repository(),
      create: async () => {
        throw new Error('database is on fire');
      },
      find_random_active: async (): Promise<Trade | null> => null,
      find_random_recent_active: async (): Promise<Trade | null> => null,
      count_active: async (): Promise<number> => 0,
    };
    const { feed } = build_feed(failing);

    feed.start();
    await vi.advanceTimersByTimeAsync(3000);
    feed.stop();

    expect(warn).toHaveBeenCalledTimes(3);
  });

  it('keeps booking while its book is over the cap, and works the book back toward it', async () => {
    const repository = create_in_memory_trade_repository();
    const cap = 12;
    await fill(repository, 5, 'BUY', 100);
    const { feed, sent } = build_feed(repository, { ...one_second, max_active_trades: cap });

    let booked_over_cap = false;
    feed.start();
    for (let tick = 0; tick < 150; tick += 1) {
      const active_before = await repository.count_active();
      const sent_before = sent.length;
      await vi.advanceTimersByTimeAsync(1000);
      if (active_before > cap && sent.slice(sent_before).includes('trade.created')) {
        booked_over_cap = true;
      }
    }
    feed.stop();

    expect(booked_over_cap).toBe(true);
    expect(await repository.count_active()).toBeLessThan(2 * cap);
  });

  it('holds a growing book close to its cap', async () => {
    const repository = create_in_memory_trade_repository();
    const cap = 12;
    const { feed } = build_feed(repository, { ...one_second, max_active_trades: cap });

    let largest = 0;
    feed.start();
    for (let tick = 0; tick < 300; tick += 1) {
      await vi.advanceTimersByTimeAsync(1000);
      largest = Math.max(largest, await repository.count_active());
    }
    feed.stop();

    expect(largest).toBeGreaterThanOrEqual(cap - 2);
    expect(largest).toBeLessThanOrEqual(cap + 6);
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
