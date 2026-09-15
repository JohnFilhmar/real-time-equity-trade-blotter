import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Trade } from '@blotter/shared';
import { pick_random_recent } from './active_reads.js';

/**
 * An active trade executed a given number of minutes after 09:00 on one session.
 *
 * @param minute - Minutes after the open. Also decides the business id, so each minute reads apart.
 * @param id - Row id, for the tiebreak case. Defaults to one derived from the minute.
 * @returns The trade.
 */
function a_trade(minute: number, id = `00000000-0000-4000-8000-${minute.toString().padStart(12, '0')}`): Trade {
  const at = new Date(Date.UTC(2026, 8, 14, 9, minute)).toISOString();
  return {
    id,
    tradeId: `TRD-${(100_001 + minute).toString()}`,
    symbol: 'AAPL',
    side: 'BUY',
    quantity: 100,
    price: 227.45,
    currency: 'USD',
    trader: 'JSMITH',
    book: 'EQUITIES_US',
    counterparty: 'UBS',
    tradeTimestamp: at,
    status: 'ACTIVE',
    version: 1,
    createdAt: at,
    updatedAt: at,
  };
}

describe('pick_random_recent', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('chooses nothing from an empty book', () => {
    expect(pick_random_recent([], 30)).toBeNull();
  });

  it('chooses nothing when asked for fewer than one trade', () => {
    expect(pick_random_recent([a_trade(1)], 0)).toBeNull();
  });

  it('chooses only among the newest trades by execution time, whatever order they arrive in', () => {
    const book = [5, 1, 9, 3, 7, 2, 8, 4, 6, 0].map((minute) => a_trade(minute));
    const draws = [0, 0.34, 0.67, 0.999_999];
    const random = vi.spyOn(Math, 'random');
    for (const draw of draws) {
      random.mockReturnValueOnce(draw);
    }

    const picked = draws.map(() => pick_random_recent(book, 3)?.tradeId);

    expect(picked).toEqual([a_trade(9).tradeId, a_trade(8).tradeId, a_trade(7).tradeId, a_trade(7).tradeId]);
  });

  it('breaks a tie on execution time by the higher row id, the order the blotter lists them in', () => {
    const lower = a_trade(4, '00000000-0000-4000-8000-00000000000a');
    const higher = a_trade(4, '00000000-0000-4000-8000-00000000000b');
    vi.spyOn(Math, 'random').mockReturnValue(0);

    expect(pick_random_recent([lower, higher], 1)).toBe(higher);
  });

  it('treats every trade as a candidate when the book holds fewer than asked for', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999_999);

    expect(pick_random_recent([a_trade(1), a_trade(2)], 30)?.tradeId).toBe(a_trade(1).tradeId);
  });

  it('leaves the trades it was given in their order', () => {
    const book = [a_trade(1), a_trade(3), a_trade(2)];
    const ids = book.map((trade) => trade.tradeId);

    pick_random_recent(book, 2);

    expect(book.map((trade) => trade.tradeId)).toEqual(ids);
  });
});
