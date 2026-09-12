import { describe, expect, it } from 'vitest';
import type { Trade, TradeList } from '@blotter/shared';
import { apply_trade, compare_trades, matches_query, type TradePages } from './apply_broadcast';
import { default_trade_list_query, type TradeListQuery } from './trade_query';

function trade(overrides: Partial<Trade> & { id: string }): Trade {
  return {
    tradeId: `TRD-${overrides.id.slice(0, 6)}`,
    symbol: 'AAPL',
    side: 'BUY',
    quantity: 1000,
    price: 227.45,
    currency: 'USD',
    trader: 'JSMITH',
    book: 'EQUITIES_US',
    counterparty: 'Goldman Sachs',
    tradeTimestamp: '2026-08-18T09:15:23.000Z',
    status: 'ACTIVE',
    version: 1,
    createdAt: '2026-08-18T09:15:23.000Z',
    updatedAt: '2026-08-18T09:15:23.000Z',
    ...overrides,
  };
}

function pages(...lists: Array<Pick<TradeList, 'data' | 'next_cursor'>>): TradePages {
  const total = lists.reduce((sum, list) => sum + list.data.length, 0);
  return {
    pages: lists.map((list) => ({ ...list, total, limit: 2 })),
    pageParams: lists.map((_list, index) => (index === 0 ? undefined : `cursor-${index.toString()}`)),
  };
}

const newest_first: TradeListQuery = default_trade_list_query;

const older = trade({ id: '00000000-0000-4000-8000-000000000001', tradeTimestamp: '2026-08-18T09:00:00.000Z', quantity: 100 });
const newer = trade({ id: '00000000-0000-4000-8000-000000000002', tradeTimestamp: '2026-08-18T09:30:00.000Z', quantity: 300 });
const arriving = trade({ id: '00000000-0000-4000-8000-000000000003', tradeTimestamp: '2026-08-18T10:00:00.000Z', quantity: 200 });

describe('matches_query', () => {
  it('matches substrings case-insensitively and exact enums', () => {
    expect(matches_query(older, { ...newest_first, symbol: 'aap' })).toBe(true);
    expect(matches_query(older, { ...newest_first, side: 'SELL' })).toBe(false);
    expect(matches_query(older, { ...newest_first, status: 'ACTIVE', book: 'equities' })).toBe(true);
  });

  it('applies the date range inclusively', () => {
    expect(matches_query(older, { ...newest_first, date_from: '2026-08-18T09:00:00.000Z' })).toBe(true);
    expect(matches_query(older, { ...newest_first, date_to: '2026-08-18T08:59:59.000Z' })).toBe(false);
  });
});

describe('compare_trades', () => {
  it('orders by the column then by id, honouring direction', () => {
    expect(compare_trades(older, newer, 'quantity', 'asc')).toBeLessThan(0);
    expect(compare_trades(older, newer, 'quantity', 'desc')).toBeGreaterThan(0);
    const twin = trade({ ...older, id: '00000000-0000-4000-8000-000000000000' });
    expect(compare_trades(twin, older, 'quantity', 'asc')).toBeLessThan(0);
  });
});

describe('apply_trade', () => {
  it('leaves an empty cache alone', () => {
    expect(apply_trade(undefined, arriving, newest_first)).toBeUndefined();
  });

  it('drops a trade whose version is not greater than the cached one', () => {
    const cache = pages({ data: [newer, older], next_cursor: null });
    expect(apply_trade(cache, { ...newer, quantity: 999, version: 1 }, newest_first)).toBe(cache);
  });

  it('patches an amended trade in place', () => {
    const cache = pages({ data: [newer, older], next_cursor: null });
    const result = apply_trade(cache, { ...older, quantity: 5000, version: 2 }, newest_first);
    expect(result?.pages[0]?.data.map((row) => row.quantity)).toEqual([300, 5000]);
    expect(result?.pages[0]?.total).toBe(2);
  });

  it('removes a trade that no longer matches the filters', () => {
    const cache = pages({ data: [newer, older], next_cursor: null });
    const result = apply_trade(cache, { ...older, status: 'CANCELLED', version: 2 }, { ...newest_first, status: 'ACTIVE' });
    expect(result?.pages[0]?.data.map((row) => row.id)).toEqual([newer.id]);
    expect(result?.pages[0]?.total).toBe(1);
  });

  it('inserts a new trade at the top when the view is newest first', () => {
    const cache = pages({ data: [newer, older], next_cursor: null });
    const result = apply_trade(cache, arriving, newest_first);
    expect(result?.pages[0]?.data.map((row) => row.id)).toEqual([arriving.id, newer.id, older.id]);
    expect(result?.pages[0]?.total).toBe(3);
  });

  it('inserts at the sorted position for another column', () => {
    const cache = pages({ data: [older, newer], next_cursor: null });
    const result = apply_trade(cache, arriving, { ...newest_first, sort_by: 'quantity', sort_dir: 'asc' });
    expect(result?.pages[0]?.data.map((row) => row.quantity)).toEqual([100, 200, 300]);
  });

  it('ignores a trade that does not match the filters, total included', () => {
    const cache = pages({ data: [newer, older], next_cursor: null });
    const result = apply_trade(cache, { ...arriving, side: 'SELL' }, { ...newest_first, side: 'BUY' });
    expect(result).toBe(cache);
  });

  it('only moves the total when the row belongs beyond the loaded window', () => {
    const cache = pages({ data: [newer, older], next_cursor: 'more' });
    const oldest = trade({ id: '00000000-0000-4000-8000-000000000004', tradeTimestamp: '2026-08-18T08:00:00.000Z' });
    const result = apply_trade(cache, oldest, newest_first);
    expect(result?.pages[0]?.data).toHaveLength(2);
    expect(result?.pages[0]?.total).toBe(3);
  });

  it('inserts into the right page without re-chunking', () => {
    const between = trade({ id: '00000000-0000-4000-8000-000000000005', tradeTimestamp: '2026-08-18T09:20:00.000Z' });
    const cache = pages({ data: [arriving, newer], next_cursor: 'c1' }, { data: [older], next_cursor: null });
    const result = apply_trade(cache, between, newest_first);
    expect(result?.pages[0]?.data.map((row) => row.id)).toEqual([arriving.id, newer.id]);
    expect(result?.pages[1]?.data.map((row) => row.id)).toEqual([between.id, older.id]);
    expect(result?.pages.every((page) => page.total === 4)).toBe(true);
  });

  it('keeps every page total in step when a row leaves a later page', () => {
    const cache = pages({ data: [arriving, newer], next_cursor: 'c1' }, { data: [older], next_cursor: null });
    const result = apply_trade(cache, { ...older, status: 'CANCELLED', version: 2 }, { ...newest_first, status: 'ACTIVE' });
    expect(result?.pages.map((page) => page.total)).toEqual([2, 2]);
  });
});
