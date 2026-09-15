'use client';

import { useCallback, useState, type ReactNode } from 'react';
import type { Trade } from '@blotter/shared';
import { TradePanel } from '@/components/trade/TradePanel';
import { TradeTicket } from '@/components/trade/TradeTicket';
import { Button } from '@/components/ui/Button';
import { useConnectionStatus, useMutationGate } from '@/hooks/useConnection';
import { useListQuery } from '@/hooks/useListQuery';
import { phone_query, useMediaQuery } from '@/hooks/useMediaQuery';
import { useTrades, type TradesResult } from '@/hooks/useTrades';
import { can } from '@/lib/auth/permissions';
import { active_filter_count, type TradeListQuery } from '@/lib/query/tradeQuery';
import { useSession } from '@/providers/SessionProvider';
import type { ConnectionStatus } from '@/types/connection';
import { ActiveChips } from './ActiveChips';
import { FilterPanel } from './FilterPanel';
import { BookButton, FilterRail, RowCount } from './FilterRail';
import { ConnectionBanner, TableEmptyState, type EmptyState } from './TableState';
import { TradeCards } from './TradeCards';
import { TradeGrid } from './TradeGrid';

/**
 * Decides which of the full-surface states the grid is in, if any.
 *
 * @param trades - The list query result.
 * @param query - The current filters.
 * @param status - The link state, which separates "no results" from "no results yet, feed live".
 * @param can_book - Whether the empty state may offer to book.
 * @param actions - The handlers the states offer.
 * @returns The state, or `null` when there are rows to show.
 */
function empty_state_for(
  trades: TradesResult,
  query: TradeListQuery,
  status: ConnectionStatus,
  can_book: boolean,
  actions: { book: () => void; clear: () => void; retry: () => void },
): EmptyState | null {
  if (trades.query.isPending) return { kind: 'loading' };
  if (trades.query.isError && trades.rows.length === 0) {
    return { kind: 'error', detail: trades.query.error.message, onRetry: actions.retry };
  }
  if (trades.rows.length > 0) return null;
  if (active_filter_count(query) === 0) return { kind: 'empty', can_book, onBook: actions.book };
  return status === 'live' ? { kind: 'filtered_live', onClear: actions.clear } : { kind: 'no_results', onClear: actions.clear };
}

/** The screen: the rail's column beside everything else. The blotter skeleton is built on the same classes. */
export const blotter_screen_classes = 'relative flex min-h-0 flex-1';

/** Holds the rail beside the grid from `lg` up. Below that the rail opens in the filters panel. */
export const blotter_rail_wrapper_classes = 'hidden lg:flex';

/** The column right of the rail: the toolbar, the connection banner, then the grid or the cards. */
export const blotter_body_classes = 'flex min-h-0 min-w-0 flex-1 flex-col';

/** The toolbar row above the grid. */
export const blotter_toolbar_classes = 'flex shrink-0 flex-wrap items-center gap-2.25 border-b border-rule px-3.5 py-2.5';

/**
 * The blotter page: filter rail, toolbar, grid or cards, and the detail panel. Below `lg` the rail
 * has no room, so a Filters button in the toolbar opens it in a panel. Filters and sort live in the
 * URL; selection is held by trade id so a row cannot change identity under the user while the feed
 * moves.
 *
 * @returns The screen.
 */
export function BlotterScreen(): ReactNode {
  const { session } = useSession();
  const user = session.user;
  const { query, update, clear_filters, sort_by } = useListQuery();
  const trades = useTrades(query);
  const { hasNextPage, isFetchingNextPage, fetchNextPage, refetch, isFetching, isPending } = trades.query;
  const status = useConnectionStatus();
  const gate = useMutationGate();
  const is_phone = useMediaQuery(phone_query);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [booking, setBooking] = useState(false);

  const selected = trades.rows.find((row) => row.id === selectedId) ?? null;
  const can_book = can(user, 'trade.create');
  const book_reason = can_book ? gate.reason : 'Your role cannot book trades';

  const on_select = useCallback((trade: Trade | null) => {
    setSelectedId(trade?.id ?? null);
  }, []);

  const load_more = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const open_ticket = useCallback(() => setBooking(true), []);

  const empty_state = empty_state_for(trades, query, status, can_book, {
    book: open_ticket,
    clear: clear_filters,
    retry: () => void refetch(),
  });

  const rail_props = {
    query,
    onChange: update,
    onClear: clear_filters,
    loaded: trades.rows.length,
    total: trades.total,
  };

  return (
    <div className={blotter_screen_classes}>
      {!is_phone ? (
        <div className={blotter_rail_wrapper_classes}>
          <FilterRail {...rail_props} book_button={can_book ? <BookButton onClick={open_ticket} disabled_reason={book_reason} /> : null} />
        </div>
      ) : null}

      <div className={blotter_body_classes}>
        <div className={blotter_toolbar_classes}>
          <FilterPanel active_count={active_filter_count(query)}>
            {/* No book button in the panel: below lg the toolbar and the phone button book, and a ticket opened from the panel would stack a modal on a modal. */}
            <FilterRail {...rail_props} book_button={null} layout="panel" />
          </FilterPanel>
          <div className="flex min-w-0 flex-wrap gap-1.5">
            <ActiveChips query={query} onRemove={(key) => update({ [key]: undefined })} />
          </div>
          <div className="ml-auto flex items-center gap-2.25">
            <RowCount loaded={trades.rows.length} total={trades.total} />
            <Button onClick={() => void refetch()} aria-label="Refresh from the API" disabled={isFetching}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                <path d="M21 12a9 9 0 11-2.6-6.4M21 3v6h-6" />
              </svg>
              {isFetching && !isPending ? 'Refreshing' : 'Refresh'}
            </Button>
            {can_book ? (
              <Button variant="primary" onClick={open_ticket} disabled_reason={book_reason} className="hidden md:inline-flex">
                New trade
              </Button>
            ) : null}
          </div>
        </div>

        <ConnectionBanner status={status} />

        {empty_state !== null ? (
          <TableEmptyState state={empty_state} />
        ) : is_phone ? (
          <div className="min-h-0 flex-1 overflow-auto">
            <TradeCards rows={trades.rows} selected_id={selectedId} onSelect={on_select} onLoadMore={load_more} has_more={hasNextPage} />
          </div>
        ) : (
          <TradeGrid
            rows={trades.rows}
            total={trades.total}
            sort_by={query.sort_by}
            sort_dir={query.sort_dir}
            selected_id={selectedId}
            onSort={sort_by}
            onSelect={on_select}
            onLoadMore={load_more}
            has_more={hasNextPage}
          />
        )}
      </div>

      {selected !== null ? <TradePanel trade={selected} onClose={() => setSelectedId(null)} /> : null}

      {can_book && is_phone ? (
        <button
          type="button"
          onClick={open_ticket}
          disabled={book_reason !== null}
          aria-label="Book a new trade"
          title={book_reason ?? undefined}
          className="absolute right-4 bottom-18 z-[50] grid h-13 w-13 place-items-center rounded-[26px] border border-brand-edge bg-linear-150 from-brand-btn-hi2 to-brand-btn-lo2 text-brand-lo shadow-glass backdrop-blur-[18px] disabled:opacity-40"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      ) : null}

      {booking ? (
        <TradeTicket
          mode={{ kind: 'new' }}
          onClose={() => setBooking(false)}
          onBooked={(trade) => {
            setBooking(false);
            setSelectedId(trade.id);
          }}
        />
      ) : null}
    </div>
  );
}
