import { describe, expect, it } from 'vitest';
import type { Position, TradeEvent } from '@blotter/shared';
import { apply_event_to_feed, apply_event_to_history, apply_position, type EventPages } from './applyEvent';

function event(id: string, version: number, occurred: string): TradeEvent {
  return {
    id,
    tradeId: 'TRD-100001',
    version,
    action: 'AMENDED',
    source: 'API',
    changes: { quantity: { from: 100, to: 200 } },
    actor: 'JSMITH',
    occurredAt: occurred,
  };
}

function pages(...lists: TradeEvent[][]): EventPages {
  const total = lists.reduce((sum, list) => sum + list.length, 0);
  return {
    pages: lists.map((data, index) => ({ data, total, limit: 2, next_cursor: index === lists.length - 1 ? null : `c${index.toString()}` })),
    pageParams: lists.map((_list, index) => (index === 0 ? undefined : `c${(index - 1).toString()}`)),
  };
}

const older = event('00000000-0000-4000-8000-000000000001', 2, '2026-08-18T09:00:00.000Z');
const newer = event('00000000-0000-4000-8000-000000000002', 3, '2026-08-18T09:30:00.000Z');
const arriving = event('00000000-0000-4000-8000-000000000003', 4, '2026-08-18T10:00:00.000Z');

describe('apply_event_to_feed', () => {
  it('leaves an unopened feed alone', () => {
    expect(apply_event_to_feed(undefined, arriving)).toBeUndefined();
  });

  it('prepends to page zero and moves every total', () => {
    const result = apply_event_to_feed(pages([newer], [older]), arriving);
    expect(result?.pages[0]?.data.map((row) => row.id)).toEqual([arriving.id, newer.id]);
    expect(result?.pages[1]?.data.map((row) => row.id)).toEqual([older.id]);
    expect(result?.pages.map((page) => page.total)).toEqual([3, 3]);
  });

  it('ignores an event already in the feed', () => {
    const cache = pages([newer], [older]);
    expect(apply_event_to_feed(cache, newer)).toBe(cache);
  });
});

describe('apply_event_to_history', () => {
  it('appends in version order and ignores duplicates', () => {
    expect(apply_event_to_history([newer], older)?.map((row) => row.version)).toEqual([2, 3]);
    const history = [older, newer];
    expect(apply_event_to_history(history, newer)).toBe(history);
    expect(apply_event_to_history(undefined, newer)).toBeUndefined();
  });
});

describe('apply_position', () => {
  const aapl: Position = { symbol: 'AAPL', currency: 'USD', netQuantity: 100, buyQuantity: 100, sellQuantity: 0, grossNotional: 22_745, tradeCount: 1, averagePrice: 227.45, realisedPnl: 0 };
  const msft: Position = { ...aapl, symbol: 'MSFT' };

  it('replaces, inserts sorted, and removes a flat book with no trades', () => {
    expect(apply_position([aapl], { ...aapl, netQuantity: 300 })?.[0]?.netQuantity).toBe(300);
    expect(apply_position([msft], aapl)?.map((row) => row.symbol)).toEqual(['AAPL', 'MSFT']);
    expect(apply_position([aapl, msft], { ...aapl, netQuantity: 0, tradeCount: 0 })?.map((row) => row.symbol)).toEqual(['MSFT']);
    expect(apply_position(undefined, aapl)).toBeUndefined();
  });
});
