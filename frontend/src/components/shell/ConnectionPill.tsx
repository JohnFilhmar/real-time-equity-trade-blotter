'use client';

import type { ReactNode } from 'react';
import { useConnectionStatus, useLastSeq } from '@/hooks/use_connection';
import type { ConnectionStatus } from '@/types/connection';

const copy: Record<ConnectionStatus, string> = {
  connecting: 'CONNECTING',
  live: 'LIVE',
  reconnecting: 'RECONNECTING',
  resyncing: 'RESYNCING',
};

const tone: Record<ConnectionStatus, string> = {
  connecting: 'bg-brand-bg text-brand shadow-[inset_0_0_0_1px_var(--brand_edge)]',
  live: 'bg-brand-bg text-brand shadow-[inset_0_0_0_1px_var(--brand_edge)]',
  resyncing: 'bg-brand-bg text-brand shadow-[inset_0_0_0_1px_var(--brand_edge)]',
  reconnecting: 'bg-warn-bg text-warn shadow-[inset_0_0_0_1px_var(--warn_edge_hi)]',
};

/**
 * The connection pill: three states in words, cyan for live and resyncing, amber for down. The
 * last broadcast sequence is shown beside LIVE so a watcher can see the stream advancing.
 *
 * @returns The pill.
 */
export function ConnectionPill(): ReactNode {
  const status = useConnectionStatus();
  const last_seq = useLastSeq();

  return (
    <div
      data-state={status}
      role="status"
      aria-live="polite"
      className={`flex h-[27px] items-center gap-[7px] whitespace-nowrap rounded-[14px] px-[10px] font-mono text-[10.5px] font-medium tracking-[.07em] ${tone[status]}`}
    >
      <span className={`h-[6px] w-[6px] rounded-full bg-current ${status === 'reconnecting' ? 'animate-breathe' : 'animate-pulse-dot'}`} aria-hidden="true" />
      {copy[status]}
      {status === 'live' && last_seq !== null ? <span className="text-brand-lo">seq {last_seq}</span> : null}
    </div>
  );
}
