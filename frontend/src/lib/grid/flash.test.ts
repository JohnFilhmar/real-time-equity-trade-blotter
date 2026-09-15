import { describe, expect, it } from 'vitest';
import type { Trade } from '@blotter/shared';
import { changed_cells, flash_throttle_ms, is_flash_throttled } from './flash';

/**
 * A stored trade at version 1, with any field replaced.
 *
 * @param overrides - Fields to replace.
 * @returns The trade.
 */
function a_trade(overrides: Partial<Trade> = {}): Trade {
  return {
    id: '5b0e1c1a-7d0e-4c55-9a53-6a4f3f4f2a10',
    tradeId: 'TRD-100001',
    symbol: 'AAPL',
    side: 'BUY',
    quantity: 5000,
    price: 227.45,
    currency: 'USD',
    trader: 'JSMITH',
    book: 'EQUITIES_US',
    counterparty: 'Goldman Sachs',
    tradeTimestamp: '2026-09-15T09:15:23.000Z',
    status: 'ACTIVE',
    version: 1,
    createdAt: '2026-09-15T09:15:23.000Z',
    updatedAt: '2026-09-15T09:15:23.000Z',
    ...overrides,
  };
}

describe('changed_cells', () => {
  it('lights the price and the notional up when an amendment raised the price', () => {
    const cells = changed_cells(a_trade(), a_trade({ version: 2, price: 229.1 }));

    expect(Object.fromEntries(cells)).toEqual({ price: 'up', notional: 'up' });
  });

  it('lights the quantity and the notional down when an amendment cut the quantity', () => {
    const cells = changed_cells(a_trade(), a_trade({ version: 2, quantity: 3000 }));

    expect(Object.fromEntries(cells)).toEqual({ quantity: 'down', notional: 'down' });
  });

  it('gives each numeric cell its own direction when they move opposite ways', () => {
    const cells = changed_cells(a_trade({ quantity: 100, price: 10 }), a_trade({ version: 2, quantity: 200, price: 6 }));

    expect(Object.fromEntries(cells)).toEqual({ quantity: 'up', price: 'down', notional: 'up' });
  });

  it('marks a changed text column as changed, keyed by that column', () => {
    const cells = changed_cells(a_trade(), a_trade({ version: 2, counterparty: 'Nomura', book: 'TECH_GROWTH' }));

    expect(Object.fromEntries(cells)).toEqual({ counterparty: 'changed', book: 'changed' });
  });

  it('lights nothing when a new version changed no cell, such as an amendment back to the same price', () => {
    expect(changed_cells(a_trade(), a_trade({ version: 2 })).size).toBe(0);
  });

  it('lights nothing for a cancellation, which moves only the status', () => {
    expect(changed_cells(a_trade(), a_trade({ version: 2, status: 'CANCELLED' })).size).toBe(0);
  });

  it('lights nothing for a stale or repeated version, even when its fields differ', () => {
    expect(changed_cells(a_trade({ version: 3 }), a_trade({ version: 2, price: 300 })).size).toBe(0);
    expect(changed_cells(a_trade({ version: 2 }), a_trade({ version: 2, price: 300 })).size).toBe(0);
  });
});

describe('is_flash_throttled', () => {
  const started_at = 10_000;

  it('never throttles a cell that has not flashed yet', () => {
    expect(is_flash_throttled(undefined, started_at)).toBe(false);
  });

  it('throttles a second flash inside the window', () => {
    expect(is_flash_throttled(started_at, started_at + flash_throttle_ms - 1)).toBe(true);
  });

  it('allows a flash once the window has passed', () => {
    expect(is_flash_throttled(started_at, started_at + flash_throttle_ms)).toBe(false);
  });
});
