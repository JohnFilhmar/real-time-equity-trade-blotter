import { create } from 'zustand';
import type { ConnectionStatus } from '@/types/connection';

/** What the interface knows about the live link. */
export interface ConnectionState {
  /** The lifecycle state the pill shows and the mutation guards read. */
  status: ConnectionStatus;

  /** The last broadcast sequence seen, or `null` since the last resync. */
  last_seq: number | null;

  /** When the last broadcast was emitted by the server, or `null` before the first. */
  last_event_at: string | null;

  /** Moves the link to a new state. */
  set_status: (status: ConnectionStatus) => void;

  /** Records a broadcast's position in the stream. */
  record_event: (seq: number, emitted_at: string) => void;

  /** Forgets the sequence, so the next broadcast is accepted whatever its number. */
  reset_sequence: () => void;
}

/**
 * The connection store.
 *
 * A store rather than Context because the pill, the toolbar buttons, the drawer actions, the table
 * state and the ticket all subscribe, and each should re-render only when the slice it reads
 * changes. Server-owned data never lives here; it stays in TanStack Query.
 */
export const useConnectionStore = create<ConnectionState>()((set) => ({
  status: 'connecting',
  last_seq: null,
  last_event_at: null,
  set_status: (status) => set({ status }),
  record_event: (seq, emitted_at) => set({ last_seq: seq, last_event_at: emitted_at }),
  reset_sequence: () => set({ last_seq: null }),
}));

/**
 * Whether a mutation may be sent right now.
 *
 * Mutations are blocked, never queued, while the link is not `live`: a confirmation for a trade
 * the server has not accepted is a worse failure than a disabled button.
 *
 * @param status - The current link state.
 * @returns True only when live.
 */
export function mutations_allowed(status: ConnectionStatus): boolean {
  return status === 'live';
}

/**
 * The reason mutations are blocked, for a disabled control's tooltip and label.
 *
 * @param status - The current link state.
 * @returns A sentence, or `null` when mutations are allowed.
 */
export function mutation_block_reason(status: ConnectionStatus): string | null {
  switch (status) {
    case 'live':
      return null;
    case 'resyncing':
      return 'Catching up with the desk, one moment';
    case 'reconnecting':
      return 'Link to the desk is down, reconnecting';
    default:
      return 'Connecting to the desk';
  }
}
