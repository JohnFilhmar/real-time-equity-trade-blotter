import type { ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { trade_state_message_id } from '@/lib/grid/gridFocus';
import type { ConnectionStatus } from '@/types/connection';
import { BlotterRowsSkeleton } from './BlotterRowsSkeleton';

/** The full-surface states: the grid is replaced by copy. */
export type EmptyState =
  | { kind: 'loading' }
  | { kind: 'error'; detail: string; onRetry: () => void }
  | { kind: 'empty'; can_book: boolean; onBook: () => void }
  | { kind: 'no_results'; onClear: () => void }
  | { kind: 'filtered_live'; onClear: () => void };

/**
 * Renders one of the states in which the grid has nothing to show, each with copy that says what
 * happened and what to do next. An empty surface with no message is a bug. While the first page
 * loads, the grid's own skeleton rows stand in its place.
 *
 * The title and body sit in one focusable block under a fixed id, so the top bar's skip link lands
 * on the reason there are no trades to show. While loading, the skeleton rows carry their own id
 * and take the skip link instead.
 *
 * @param props - Which state, and the action it offers.
 * @returns The state panel, or the skeleton rows while loading.
 */
export function TableEmptyState({ state }: { state: EmptyState }): ReactNode {
  if (state.kind === 'loading') {
    return <BlotterRowsSkeleton />;
  }

  const copy: Record<Exclude<EmptyState['kind'], 'loading'>, { title: string; body: string }> = {
    error: {
      title: 'The blotter could not be loaded',
      body: state.kind === 'error' ? state.detail : '',
    },
    empty: {
      title: 'No trades on the blotter yet',
      body: 'The API seeds five hundred realistic trades into an empty database on first start when SEED_ON_STARTUP is true. Once anything is booked it appears here for everyone.',
    },
    no_results: {
      title: 'No trades match these filters',
      body: 'Trades exist, but none of them fit every filter that is set.',
    },
    filtered_live: {
      title: 'No trades match these filters',
      body: 'The feed is live, so a matching trade will appear here the moment one is booked.',
    },
  };

  const { title, body } = copy[state.kind];

  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center" role="status">
      <div id={trade_state_message_id} tabIndex={-1} className="flex flex-col items-center gap-3">
        <p className="m-0 text-[14px] font-semibold text-text">{title}</p>
        <p className="m-0 max-w-[46ch] text-[12.5px] leading-[1.6] text-muted">{body}</p>
      </div>
      {state.kind === 'error' ? (
        <Button variant="primary" onClick={state.onRetry}>
          Retry
        </Button>
      ) : null}
      {state.kind === 'empty' && state.can_book ? (
        <Button variant="primary" onClick={state.onBook}>
          Book the first trade
        </Button>
      ) : null}
      {state.kind === 'no_results' || state.kind === 'filtered_live' ? (
        <Button onClick={state.onClear}>Clear filters</Button>
      ) : null}
    </div>
  );
}

/**
 * The banner shown over rows that are still on screen but not trustworthy: the link is down, or
 * the refetch after a reconnect is in flight.
 *
 * @param props - The connection status.
 * @returns A banner, or `null` while live.
 */
export function ConnectionBanner({ status }: { status: ConnectionStatus }): ReactNode {
  if (status === 'live') {
    return null;
  }

  const copy: Record<Exclude<ConnectionStatus, 'live'>, { title: string; body: string; tone: string }> = {
    connecting: {
      title: 'Connecting to the desk',
      body: 'Opening the live link. Rows update the moment it is up.',
      tone: 'border-brand-edge bg-brand-bg text-brand-lo',
    },
    reconnecting: {
      title: 'Link to the desk is down',
      body: 'Reconnecting. The rows shown may be stale, and booking, amending and cancelling are paused until the link returns.',
      tone: 'border-warn-edge-hi bg-warn-bg text-warn',
    },
    resyncing: {
      title: 'Catching up with the desk',
      body: 'The link is back and the blotter is refetching so nothing missed while it was down is left out.',
      tone: 'border-brand-edge bg-brand-bg text-brand-lo',
    },
  };

  const { title, body, tone } = copy[status];

  return (
    <div role="status" className={`mx-3.5 mt-2.5 rounded-r border px-3 py-2 text-[12px] ${tone}`}>
      <b className="font-semibold">{title}.</b> <span className="text-text-2">{body}</span>
    </div>
  );
}
