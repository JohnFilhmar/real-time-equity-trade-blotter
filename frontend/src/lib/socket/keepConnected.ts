import type { HubConnection } from '@microsoft/signalr';

/** The part of a hub connection the keeper drives, narrowed so a test can stand in for it. */
export type Link = Pick<HubConnection, 'start' | 'stop' | 'onreconnecting' | 'onreconnected' | 'onclose'>;

/** What the keeper tells the caller about the link. */
export interface LinkEvents {
  /** The link is open, the first time or again after a drop. The caller resyncs. */
  on_open: () => void;
  /** The link is down and a retry is coming. */
  on_down: () => void;
}

/**
 * How long to wait before the next connection attempt: 500 ms, doubling to a 5 s ceiling, the
 * Socket.IO client's own schedule.
 *
 * @param previous_attempts - Attempts that have already failed in a row. Zero for the first retry.
 * @returns The wait in milliseconds, never more than 5000.
 */
export function reconnect_delay(previous_attempts: number): number {
  return Math.min(500 * 2 ** previous_attempts, 5_000);
}

/**
 * Starts the link and keeps it up until the returned function stops it.
 *
 * SignalR's automatic reconnect only covers a link that was up and dropped. A first start that
 * fails, and a link the server closed outright, are the caller's to retry, so this retries both on
 * the same schedule, forever, as the Socket.IO client did. Every open, first or re-, is reported,
 * because the caller cannot trust its cache after any gap.
 *
 * @param link - A hub connection that has not been started.
 * @param events - Callbacks for the link going up and going down.
 * @returns Stops the link and every pending retry. Callbacks never fire after it is called.
 */
export function keep_connected(link: Link, events: LinkEvents): () => Promise<void> {
  let stopped = false;
  let attempts = 0;
  let retry: ReturnType<typeof setTimeout> | null = null;

  const start = async (): Promise<void> => {
    try {
      await link.start();
      attempts = 0;
      if (!stopped) {
        events.on_open();
      }
    } catch {
      if (stopped) {
        return;
      }
      events.on_down();
      retry = setTimeout(() => {
        retry = null;
        void start();
      }, reconnect_delay(attempts));
      attempts += 1;
    }
  };

  link.onreconnecting(() => {
    if (!stopped) {
      events.on_down();
    }
  });
  link.onreconnected(() => {
    if (!stopped) {
      events.on_open();
    }
  });
  link.onclose(() => {
    if (!stopped) {
      events.on_down();
      void start();
    }
  });

  void start();

  return async () => {
    stopped = true;
    if (retry !== null) {
      clearTimeout(retry);
      retry = null;
    }
    await link.stop();
  };
}
