import { describe, expect, it } from 'vitest';
import type { Trade } from '@blotter/shared';
import { build_cancellation_change_set, build_change_set } from './build_change_set.js';

/** A stored trade to diff against. */
const before: Trade = {
  id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  tradeId: 'TRD-100001',
  symbol: 'AAPL',
  side: 'BUY',
  quantity: 5000,
  price: 227.45,
  currency: 'USD',
  trader: 'JSMITH',
  book: 'EQUITIES_UK',
  counterparty: 'Goldman Sachs',
  tradeTimestamp: '2026-08-18T09:15:23.000Z',
  status: 'ACTIVE',
  version: 1,
  createdAt: '2026-08-18T09:15:24.000Z',
  updatedAt: '2026-08-18T09:15:24.000Z',
};

describe('build_change_set', () => {
  it('records both sides of a changed field', () => {
    expect(build_change_set(before, { quantity: 7500 })).toEqual({
      quantity: { from: 5000, to: 7500 },
    });
  });

  it('records every field that moved', () => {
    const changes = build_change_set(before, {
      quantity: 7500,
      price: 230.1,
      counterparty: 'Nomura',
    });

    expect(Object.keys(changes).sort()).toEqual(['counterparty', 'price', 'quantity']);
  });

  it('ignores a field resent at the value it already held', () => {
    expect(build_change_set(before, { quantity: 5000, price: 230.1 })).toEqual({
      price: { from: 227.45, to: 230.1 },
    });
  });

  it('returns nothing when the amendment changes nothing', () => {
    expect(build_change_set(before, { quantity: 5000, book: 'EQUITIES_UK' })).toEqual({});
  });

  it('never records a field an amendment is not allowed to touch', () => {
    const changes = build_change_set(before, { quantity: 7500 });

    expect(changes).not.toHaveProperty('symbol');
    expect(changes).not.toHaveProperty('side');
    expect(changes).not.toHaveProperty('version');
    expect(changes).not.toHaveProperty('status');
  });
});

describe('build_cancellation_change_set', () => {
  it('records the status transition in the same shape as any other movement', () => {
    expect(build_cancellation_change_set()).toEqual({
      status: { from: 'ACTIVE', to: 'CANCELLED' },
    });
  });
});
