import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Trade } from '@blotter/shared';
import { flash_duration_ms, flash_throttle_ms } from '@/lib/grid/flash';
import { useFlash } from './useFlash';

/**
 * A stored trade at version 1, with any field replaced.
 *
 * @param id - Row id.
 * @param overrides - Fields to replace.
 * @returns The trade.
 */
function a_trade(id: string, overrides: Partial<Trade> = {}): Trade {
  return {
    id,
    tradeId: `TRD-${id}`,
    symbol: 'AAPL',
    side: 'BUY',
    quantity: 100,
    price: 10,
    currency: 'USD',
    trader: 'JSMITH',
    book: 'EQUITIES_US',
    counterparty: 'UBS',
    tradeTimestamp: '2026-09-15T09:15:23.000Z',
    status: 'ACTIVE',
    version: 1,
    createdAt: '2026-09-15T09:15:23.000Z',
    updatedAt: '2026-09-15T09:15:23.000Z',
    ...overrides,
  };
}

/**
 * Renders the hook over a list, under a baseline key.
 *
 * @param rows - The first rows.
 * @param key - The first baseline key.
 * @returns The hook's result and rerender.
 */
function render_flash(rows: readonly Trade[], key: string | null = 'view') {
  return renderHook(({ list, baseline }: { list: readonly Trade[]; baseline: string | null }) => useFlash(list, baseline), {
    initialProps: { list: rows, baseline: key },
  });
}

/**
 * Advances the fake clock, letting queued frames and timers run inside act.
 *
 * @param ms - How far to advance.
 */
function advance(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe('useFlash', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'Date'] });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('never flashes the rows it sees first', () => {
    const { result } = render_flash([a_trade('a'), a_trade('b')]);

    advance(16);

    expect(result.current.inserted.size).toBe(0);
    expect(result.current.cells.size).toBe(0);
  });

  it('flashes a row that arrives later as inserted, until the flash window ends', () => {
    const a = a_trade('a');
    const { result, rerender } = render_flash([a]);

    rerender({ list: [a_trade('b'), a], baseline: 'view' });
    advance(16);

    expect([...result.current.inserted]).toEqual(['b']);
    expect(result.current.cells.size).toBe(0);

    advance(flash_duration_ms);

    expect(result.current.inserted.size).toBe(0);
  });

  it('flashes only the cells an amendment changed, tagged with the version that changed them', () => {
    const { result, rerender } = render_flash([a_trade('a')]);

    rerender({ list: [a_trade('a', { version: 2, price: 11 })], baseline: 'view' });
    advance(16);

    expect(result.current.inserted.size).toBe(0);
    expect(Object.fromEntries(result.current.cells.get('a') ?? [])).toEqual({
      price: { kind: 'up', version: 2 },
      notional: { kind: 'up', version: 2 },
    });

    advance(flash_duration_ms);

    expect(result.current.cells.size).toBe(0);
  });

  it('does not flash an amendment that changed nothing visible, nor a cancellation', () => {
    const { result, rerender } = render_flash([a_trade('a'), a_trade('b')]);

    rerender({ list: [a_trade('a', { version: 2 }), a_trade('b', { version: 2, status: 'CANCELLED' })], baseline: 'view' });
    advance(16);

    expect(result.current.inserted.size).toBe(0);
    expect(result.current.cells.size).toBe(0);
  });

  it('holds a cell to one flash per throttle window, then restarts it on a later version', () => {
    const { result, rerender } = render_flash([a_trade('a')]);

    rerender({ list: [a_trade('a', { version: 2, price: 11 })], baseline: 'view' });
    advance(16);
    rerender({ list: [a_trade('a', { version: 3, price: 12 })], baseline: 'view' });
    advance(16);

    expect(result.current.cells.get('a')?.get('price')).toEqual({ kind: 'up', version: 2 });

    advance(flash_throttle_ms);
    rerender({ list: [a_trade('a', { version: 4, price: 9 })], baseline: 'view' });
    advance(16);

    expect(result.current.cells.get('a')?.get('price')).toEqual({ kind: 'down', version: 4 });
  });

  it('does not flash the rows of a new sort or filter as new, but flashes arrivals after them', () => {
    const { result, rerender } = render_flash([a_trade('a'), a_trade('b')], 'newest_first');

    rerender({ list: [a_trade('b'), a_trade('a'), a_trade('x')], baseline: null });
    advance(16);
    rerender({ list: [a_trade('c'), a_trade('d')], baseline: 'by_quantity' });
    advance(16);

    expect(result.current.inserted.size).toBe(0);
    expect(result.current.cells.size).toBe(0);

    rerender({ list: [a_trade('e'), a_trade('c'), a_trade('d')], baseline: 'by_quantity' });
    advance(16);

    expect([...result.current.inserted]).toEqual(['e']);
  });
});
