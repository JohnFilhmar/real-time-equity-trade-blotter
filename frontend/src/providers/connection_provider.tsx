'use client';

import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect, useRef, type ReactNode } from 'react';
import { trade_events, type BroadcastEnvelope } from '@blotter/shared';
import { event_feed_keys, position_keys, trade_keys } from '@/lib/query/keys';
import { settle_trade } from '@/lib/query/settle_trade';
import { create_socket, type BlotterSocket } from '@/lib/socket/create_socket';
import { useConnectionStore } from '@/lib/stores/connection_store';
import { useAccessToken } from '@/providers/session_provider';

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
 * Owns the socket for the signed-in session and feeds its broadcasts into the query cache.
 *
 * Broadcasts are queued and applied once per animation frame, so a burst of events costs one
 * render rather than one each. Inside a frame they are applied in sequence order, and a gap in
 * the sequence, or a sequence that went backwards because the server restarted, triggers a full
 * resync rather than a guess about what was missed.
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

    let queue: BroadcastEnvelope[] = [];
    let frame: number | null = null;

    const flush = (): void => {
      frame = null;
      const pending = queue.sort((a, b) => a.seq - b.seq);
      queue = [];

      for (const envelope of pending) {
        const store = useConnectionStore.getState();
        const expected = store.last_seq === null ? envelope.seq : store.last_seq + 1;
        store.record_event(envelope.seq, envelope.emitted_at);

        if (envelope.seq !== expected) {
          // Missed one, or the server restarted and the counter went backwards. Either way the
          // cache cannot be trusted to converge on its own.
          start_resync();
          return;
        }

        settle_trade(query_client, envelope.trade);
      }
    };

    const enqueue = (envelope: BroadcastEnvelope): void => {
      queue.push(envelope);
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
    socket.on(trade_events.created, enqueue);
    socket.on(trade_events.amended, enqueue);
    socket.on(trade_events.cancelled, enqueue);

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
