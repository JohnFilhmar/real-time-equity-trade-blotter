import { describe, expect, it } from 'vitest';
import { trade_side_values, trade_status_values } from '@blotter/shared';
import { generate_trades } from './generate_trades.js';

describe('generate_trades', () => {
  it('is deterministic for a given seed, so the dataset reproduces between runs', () => {
    expect(generate_trades(50)).toEqual(generate_trades(50));
  });

  it('produces a different dataset for a different seed', () => {
    expect(generate_trades(50, 1)).not.toEqual(generate_trades(50, 2));
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

  it('quotes prices to six decimal places, matching the column scale', () => {
    for (const trade of generate_trades(50)) {
      expect(trade.price).toMatch(/^\d+\.\d{6}$/);
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
