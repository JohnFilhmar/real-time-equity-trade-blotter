'use client';

import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect, useRef, type ReactNode } from 'react';
import {
  trade_events,
  type BroadcastEnvelope,
  type PositionEnvelope,
  type TradeEventEnvelope,
} from '@blotter/shared';
import { event_feed_keys, position_keys, trade_keys } from '@/lib/query/keys';
import { settle_event, settle_position } from '@/lib/query/settle_event';
import { settle_trade } from '@/lib/query/settle_trade';
import { create_socket, type BlotterSocket } from '@/lib/socket/create_socket';
import { useConnectionStore } from '@/lib/stores/connection_store';
import { useMarkStore } from '@/lib/stores/mark_store';
import { useAccessToken } from '@/providers/session_provider';

/** One broadcast waiting for the next frame, whatever it carries. */
type Pending =
  | { kind: 'trade'; envelope: BroadcastEnvelope }
  | { kind: 'event'; envelope: TradeEventEnvelope }
  | { kind: 'position'; envelope: PositionEnvelope };

/**
 * Refetches everything the socket could have made stale, then declares the link live.
 *
 * Called on every connect, first or re-, and on a sequence gap. The status only moves to `live`
 * once the refetch has settled, which is what stops the pill going green the instant the socket
 * opens while the rows on screen are still old.
 *
 * @param query_client - The cache.
 * @param generation - Identifies this resync, so a slower one cannot overwrite a newer one.
 * @param is_current - Reports whether this resync is still the latest.
 */
async function resync(
  query_client: QueryClient,
  generation: number,
  is_current: (generation: number) => boolean,
): Promise<void> {
  const store = useConnectionStore.getState();
  store.set_status('resyncing');
  store.reset_sequence();

  await Promise.all([
    query_client.invalidateQueries({ queryKey: trade_keys.all }),
    query_client.invalidateQueries({ queryKey: position_keys.all }),
    query_client.invalidateQueries({ queryKey: event_feed_keys.all }),
  ]);

  if (is_current(generation) && useConnectionStore.getState().status === 'resyncing') {
    useConnectionStore.getState().set_status('live');
  }
}

/**
 * Applies one broadcast to the caches by kind.
 *
 * @param query_client - The cache.
 * @param pending - The broadcast.
 */
function apply(query_client: QueryClient, pending: Pending): void {
  switch (pending.kind) {
    case 'trade':
      settle_trade(query_client, pending.envelope.trade);
      break;
    case 'event':
      settle_event(query_client, pending.envelope.event);
      break;
    case 'position':
      settle_position(query_client, pending.envelope.position);
      break;
  }
}

/**
 * Owns the socket for the signed-in session and feeds its broadcasts into the query cache.
 *
 * Trades, audit events and positions share one sequence. They are queued and applied once per
 * animation frame, in sequence order, so a burst of events costs one render rather than one each;
 * a gap in the sequence, or a sequence that went backwards because the server restarted, triggers
 * a full resync rather than a guess about what was missed. Marks carry no sequence and go straight
 * to the mark store. Nothing here issues an HTTP request while the link is healthy.
 *
 * @param props - The subtree.
 * @returns The subtree; the provider renders nothing of its own.
 */
export function ConnectionProvider({ children }: { children: ReactNode }): ReactNode {
  const token = useAccessToken();
  const query_client = useQueryClient();
  const socket_ref = useRef<BlotterSocket | null>(null);

  useEffect(() => {
    const socket = create_socket(token);
    socket_ref.current = socket;

    let generation = 0;
    const is_current = (candidate: number): boolean => candidate === generation;
    const start_resync = (): void => {
      generation += 1;
      void resync(query_client, generation, is_current);
    };

    let queue: Pending[] = [];
    let frame: number | null = null;

    const flush = (): void => {
      frame = null;
      const batch = queue.sort((a, b) => a.envelope.seq - b.envelope.seq);
      queue = [];

      for (const pending of batch) {
        const store = useConnectionStore.getState();
        const seq = pending.envelope.seq;
        const expected = store.last_seq === null ? seq : store.last_seq + 1;
        store.record_event(seq, pending.envelope.emitted_at);

        if (seq !== expected) {
          // Missed one, or the server restarted and the counter went backwards. Either way the
          // cache cannot be trusted to converge on its own.
          start_resync();
          return;
        }

        apply(query_client, pending);
      }
    };

    const enqueue = (pending: Pending): void => {
      queue.push(pending);
      if (frame === null) {
        frame = window.requestAnimationFrame(flush);
      }
    };

    socket.on('connect', start_resync);
    socket.on('disconnect', () => {
      useConnectionStore.getState().set_status('reconnecting');
    });
    socket.on('connect_error', () => {
      useConnectionStore.getState().set_status('reconnecting');
    });
    socket.on(trade_events.created, (envelope) => enqueue({ kind: 'trade', envelope }));
    socket.on(trade_events.amended, (envelope) => enqueue({ kind: 'trade', envelope }));
    socket.on(trade_events.cancelled, (envelope) => enqueue({ kind: 'trade', envelope }));
    socket.on(trade_events.event_recorded, (envelope) => enqueue({ kind: 'event', envelope }));
    socket.on(trade_events.position_updated, (envelope) => enqueue({ kind: 'position', envelope }));
    socket.on(trade_events.mark_updated, (marks) => {
      useMarkStore.getState().set_marks(marks);
    });

    useConnectionStore.getState().set_status('connecting');
    socket.connect();

    return () => {
      if (frame !== null) {
        window.cancelAnimationFrame(frame);
      }
      socket.removeAllListeners();
      socket.close();
      socket_ref.current = null;
      generation += 1;
    };
    // The socket lives for the session. A rotated token is handed to it below rather than by
    // tearing the socket down, so a routine refresh never shows as a reconnect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query_client]);

  useEffect(() => {
    const socket = socket_ref.current;
    if (socket !== null) {
      socket.auth = { token };
    }
  }, [token]);

  return children;
}
