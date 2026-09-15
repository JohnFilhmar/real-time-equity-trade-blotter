import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Trade, TradeList } from '@blotter/shared';
import type { TradePageRequest } from '@/lib/api/tradeApi';
import { apply_trade, type TradePages } from '@/lib/query/applyBroadcast';
import { trade_keys } from '@/lib/query/keys';
import { default_trade_list_query } from '@/lib/query/tradeQuery';
import { useFlash } from './useFlash';
import { useTrades } from './useTrades';

const api = vi.hoisted(() => ({
  list_trades: vi.fn<(token: string, request: TradePageRequest, signal?: AbortSignal) => Promise<TradeList>>(),
}));

vi.mock('@/lib/api/tradeApi', () => ({
  list_trades: api.list_trades,
  get_trade: vi.fn(),
  list_trade_events: vi.fn(),
}));

vi.mock('@/providers/SessionProvider', () => ({
  useAccessToken: () => 'token',
}));

/**
 * A stored trade executed some minutes after nine, so the newest-first view orders trades by that minute.
 *
 * @param id - Row id.
 * @param minute - Minutes after 09:00 UTC.
 * @returns The trade.
 */
function a_trade(id: string, minute: number): Trade {
  const at = new Date(Date.UTC(2026, 8, 15, 9, minute)).toISOString();
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
    tradeTimestamp: at,
    status: 'ACTIVE',
    version: 1,
    createdAt: at,
    updatedAt: at,
  };
}

/**
 * Renders the default list with the flash tracking the grid runs over it. The grid mounts only once
 * the first page is in, so until then the flash hook gets no baseline, as an unmounted grid would.
 *
 * @returns The query client, and the rendered hooks.
 */
function render_blotter() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }): ReactNode => createElement(QueryClientProvider, { client }, children);
  const view = renderHook(
    () => {
      const trades = useTrades(default_trade_list_query);
      const flashes = useFlash(trades.rows, trades.query.isPending ? null : trades.view_key);
      return { trades, flashes };
    },
    { wrapper },
  );
  return { client, ...view };
}

/** Runs the animation frame the flash hook starts its flashes on. */
function next_frame(): void {
  act(() => {
    vi.advanceTimersByTime(16);
  });
}

describe('useTrades', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
    api.list_trades.mockImplementation((_token, request) =>
      Promise.resolve(
        request.cursor === undefined
          ? { data: [a_trade('d', 4), a_trade('c', 3)], total: 4, limit: 200, next_cursor: 'page_2' }
          : { data: [a_trade('b', 2), a_trade('a', 1)], total: 4, limit: 200, next_cursor: null },
      ),
    );
  });

  afterEach(() => {
    cleanup();
    api.list_trades.mockReset();
    vi.useRealTimers();
  });

  it('starts a fresh baseline when the next page lands, so its rows do not flash but a later live insert does', async () => {
    const { client, result } = render_blotter();

    await waitFor(() => expect(result.current.trades.rows).toHaveLength(2));
    next_frame();

    await act(async () => {
      await result.current.trades.query.fetchNextPage();
    });
    await waitFor(() => expect(result.current.trades.rows).toHaveLength(4));
    next_frame();

    expect(result.current.flashes.inserted.size).toBe(0);

    act(() => {
      client.setQueryData<TradePages>(trade_keys.list(default_trade_list_query), (data) =>
        apply_trade(data, a_trade('e', 5), default_trade_list_query),
      );
    });
    await waitFor(() => expect(result.current.trades.rows).toHaveLength(5));
    next_frame();

    expect([...result.current.flashes.inserted]).toEqual(['e']);
  });
});
