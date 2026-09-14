import { describe, expect, it } from 'vitest';
import { instruments, trade_side_values, trade_status_values } from '@blotter/shared';
import {
  generate_live_amendment,
  generate_live_trade,
  generate_trades,
  sessions_before,
} from './generate_trades.js';

/** A fixed run date, a Wednesday, so date assertions do not depend on when the suite runs. */
const run_date = new Date('2026-09-16T10:00:00.000Z');

/** Matches a number written with at most two decimal places. */
const at_most_two_decimals = /^\d+(\.\d{1,2})?$/;

/** How many draws the precision checks take, enough to cover every instrument many times over. */
const sample_size = 300;

describe('generate_trades', () => {
  it('is deterministic for a given seed and run date, so the dataset reproduces between runs', () => {
    expect(generate_trades(50, 20_260_818, run_date)).toEqual(generate_trades(50, 20_260_818, run_date));
  });

  it('produces a different dataset for a different seed', () => {
    expect(generate_trades(50, 1, run_date)).not.toEqual(generate_trades(50, 2, run_date));
  });

  it('dates every trade in the five trading days before the day it runs', () => {
    const first_session = Date.parse('2026-09-09T00:00:00.000Z');
    const start_of_run_day = Date.parse('2026-09-16T00:00:00.000Z');

    for (const trade of generate_trades(300, 20_260_818, run_date)) {
      const at = trade.tradeTimestamp.getTime();
      expect(at).toBeGreaterThanOrEqual(first_session);
      expect(at).toBeLessThan(start_of_run_day);
      expect([0, 6]).not.toContain(trade.tradeTimestamp.getUTCDay());
    }
  });

  it('generates the requested count', () => {
    expect(generate_trades(137)).toHaveLength(137);
  });

  it('quotes prices near each instrument, not uniformly at random', () => {
    const apple = generate_trades(500).filter((trade) => trade.symbol === 'AAPL');

    expect(apple.length).toBeGreaterThan(0);
    for (const trade of apple) {
      expect(Number(trade.price)).toBeGreaterThan(227.45 * 0.95);
      expect(Number(trade.price)).toBeLessThan(227.45 * 1.05);
    }
  });

  it('quotes prices to two decimal places, as the screen shows them', () => {
    for (const trade of generate_trades(50)) {
      expect(trade.price).toMatch(/^\d+\.\d{2}$/);
    }
  });

  it('trades in round lots', () => {
    for (const trade of generate_trades(200)) {
      expect(trade.quantity % 100).toBe(0);
      expect(trade.quantity).toBeGreaterThan(0);
    }
  });

  it('places every trade inside a trading session', () => {
    for (const trade of generate_trades(200)) {
      const minutes = trade.tradeTimestamp.getUTCHours() * 60 + trade.tradeTimestamp.getUTCMinutes();
      expect(minutes).toBeGreaterThanOrEqual(8 * 60);
      expect(minutes).toBeLessThanOrEqual(16 * 60 + 30);
    }
  });

  it('cancels a minority of trades so the status filter has something to find', () => {
    const trades = generate_trades(1000);
    const cancelled = trades.filter((trade) => trade.status === 'CANCELLED').length;

    expect(cancelled).toBeGreaterThan(0);
    expect(cancelled).toBeLessThan(trades.length * 0.15);
  });

  it('only emits sides and statuses the contract allows', () => {
    for (const trade of generate_trades(200)) {
      expect(trade_side_values).toContain(trade.side);
      expect(trade_status_values).toContain(trade.status);
    }
  });

  it('returns trades ordered oldest first', () => {
    const trades = generate_trades(200);
    const timestamps = trades.map((trade) => trade.tradeTimestamp.getTime());

    expect(timestamps).toEqual([...timestamps].sort((a, b) => a - b));
  });
});

describe('sessions_before', () => {
  it('returns the weekdays before a Wednesday, earliest first, leaving out the day itself', () => {
    const sessions = sessions_before(run_date, 5).map((day) => day.toISOString().slice(0, 10));
    expect(sessions).toEqual(['2026-09-09', '2026-09-10', '2026-09-11', '2026-09-14', '2026-09-15']);
  });

  it('steps over the weekend when counting back from a Monday', () => {
    const sessions = sessions_before(new Date('2026-09-14T00:00:00.000Z'), 5).map((day) => day.toISOString().slice(0, 10));
    expect(sessions).toEqual(['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11']);
  });

  it('places every session at midnight UTC', () => {
    for (const session of sessions_before(new Date('2026-09-16T23:59:59.000Z'), 3)) {
      expect(session.toISOString().slice(11)).toBe('00:00:00.000Z');
    }
  });
});

describe('generate_live_trade', () => {
  it('quotes every price to at most two decimal places', () => {
    for (const instrument of instruments) {
      for (let index = 0; index < sample_size / 10; index += 1) {
        expect(String(generate_live_trade(instrument, 'BUY').payload.price)).toMatch(at_most_two_decimals);
      }
    }
  });

  it('books the instrument and side it is given, drawing neither itself', () => {
    const instrument = instruments[0];
    if (instrument === undefined) {
      throw new Error('the instrument universe is empty');
    }

    const generated = generate_live_trade(instrument, 'SELL');

    expect(generated.payload.symbol).toBe(instrument.symbol);
    expect(generated.payload.side).toBe('SELL');
  });
});

describe('generate_live_amendment', () => {
  it('quotes every amended price to at most two decimal places, even from a six-place one', () => {
    for (let index = 0; index < sample_size; index += 1) {
      expect(String(generate_live_amendment(443.497704).price)).toMatch(at_most_two_decimals);
    }
  });
});
