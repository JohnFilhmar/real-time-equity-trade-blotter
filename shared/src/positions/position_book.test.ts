import { describe, expect, it } from 'vitest';
import type { Trade } from '../schemas/trade.js';
import { apply_trade, build_positions, empty_position, unrealised_pnl } from './position_book.js';

let counter = 0;

function trade(overrides: Partial<Trade>): Trade {
  counter += 1;
  return {
    id: `00000000-0000-4000-8000-${counter.toString().padStart(12, '0')}`,
    tradeId: `TRD-${(100000 + counter).toString()}`,
    symbol: 'AAPL',
    side: 'BUY',
    quantity: 100,
    price: 100,
    currency: 'USD',
    trader: 'JSMITH',
    book: 'EQUITIES_US',
    counterparty: 'Goldman Sachs',
    tradeTimestamp: `2026-08-18T09:${counter.toString().padStart(2, '0')}:00.000Z`,
    status: 'ACTIVE',
    version: 1,
    createdAt: '2026-08-18T09:00:00.000Z',
    updatedAt: '2026-08-18T09:00:00.000Z',
    ...overrides,
  };
}

describe('apply_trade', () => {
  it('opens a flat book at the trade price', () => {
    const position = apply_trade(empty_position('AAPL', 'USD'), trade({ quantity: 100, price: 100 }));
    expect(position).toMatchObject({ netQuantity: 100, averagePrice: 100, realisedPnl: 0, buyQuantity: 100, tradeCount: 1, grossNotional: 10_000 });
  });

  it('moves the average when adding on the same side', () => {
    const opened = apply_trade(empty_position('AAPL', 'USD'), trade({ quantity: 100, price: 100 }));
    const added = apply_trade(opened, trade({ quantity: 100, price: 110 }));
    expect(added.netQuantity).toBe(200);
    expect(added.averagePrice).toBe(105);
    expect(added.realisedPnl).toBe(0);
  });

  it('realises against the average when closing part of the book', () => {
    const opened = apply_trade(empty_position('AAPL', 'USD'), trade({ quantity: 200, price: 100 }));
    const closed = apply_trade(opened, trade({ side: 'SELL', quantity: 50, price: 120 }));
    expect(closed.netQuantity).toBe(150);
    expect(closed.averagePrice).toBe(100);
    expect(closed.realisedPnl).toBe(1_000);
  });

  it('flips long to short and opens the remainder at the trade price', () => {
    const opened = apply_trade(empty_position('AAPL', 'USD'), trade({ quantity: 100, price: 100 }));
    const flipped = apply_trade(opened, trade({ side: 'SELL', quantity: 300, price: 90 }));
    expect(flipped.netQuantity).toBe(-200);
    expect(flipped.averagePrice).toBe(90);
    expect(flipped.realisedPnl).toBe(-1_000);
  });

  it('realises a gain when a short is covered below its average', () => {
    const shorted = apply_trade(empty_position('AAPL', 'USD'), trade({ side: 'SELL', quantity: 100, price: 100 }));
    const covered = apply_trade(shorted, trade({ quantity: 100, price: 95 }));
    expect(covered.netQuantity).toBe(0);
    expect(covered.averagePrice).toBe(0);
    expect(covered.realisedPnl).toBe(500);
  });

  it('does not mutate its input', () => {
    const before = empty_position('AAPL', 'USD');
    apply_trade(before, trade({}));
    expect(before.tradeCount).toBe(0);
  });
});

describe('build_positions', () => {
  it('walks trades in execution order regardless of input order, ignoring cancelled ones', () => {
    const later = trade({ side: 'SELL', quantity: 50, price: 120, tradeTimestamp: '2026-08-18T10:00:00.000Z' });
    const earlier = trade({ quantity: 100, price: 100, tradeTimestamp: '2026-08-18T09:00:00.000Z' });
    const cancelled = trade({ quantity: 9_999, price: 1, status: 'CANCELLED' });
    const [position] = build_positions([later, cancelled, earlier]);
    expect(position).toMatchObject({ netQuantity: 50, averagePrice: 100, realisedPnl: 1_000, tradeCount: 2 });
  });

  it('returns one position per symbol, sorted', () => {
    const positions = build_positions([trade({ symbol: 'MSFT' }), trade({ symbol: 'AAPL' }), trade({ symbol: 'HSBA.L', currency: 'GBX' })]);
    expect(positions.map((position) => position.symbol)).toEqual(['AAPL', 'HSBA.L', 'MSFT']);
    expect(positions[1]?.currency).toBe('GBX');
  });
});

describe('unrealised_pnl', () => {
  it('marks the open size against the average and is null without a mark', () => {
    const position = apply_trade(empty_position('AAPL', 'USD'), trade({ quantity: 100, price: 100 }));
    expect(unrealised_pnl(position, 103)).toBe(300);
    expect(unrealised_pnl(position, undefined)).toBeNull();
    expect(unrealised_pnl(empty_position('AAPL', 'USD'), 103)).toBe(0);
  });
});
