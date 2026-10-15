import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { keep_connected, reconnect_delay, type Link } from './keepConnected';

/** A stand-in hub connection whose starts succeed or fail on cue and whose events a test can fire. */
function fake_link(outcomes: Array<'ok' | 'fail'>) {
  const listeners = {
    reconnecting: [] as Array<(error?: Error) => void>,
    reconnected: [] as Array<(connection_id?: string) => void>,
    close: [] as Array<(error?: Error) => void>,
  };

  const link: Link = {
    start: vi.fn(async () => {
      if ((outcomes.shift() ?? 'ok') === 'fail') {
        throw new Error('negotiation refused');
      }
    }),
    stop: vi.fn(async () => {
      for (const listener of listeners.close) {
        listener();
      }
    }),
    onreconnecting: (listener) => listeners.reconnecting.push(listener),
    onreconnected: (listener) => listeners.reconnected.push(listener),
    onclose: (listener) => listeners.close.push(listener),
  };

  return {
    link,
    drop: () => listeners.reconnecting.forEach((listener) => listener()),
    recover: () => listeners.reconnected.forEach((listener) => listener()),
    close: () => listeners.close.forEach((listener) => listener(new Error('server closed the link'))),
  };
}

describe('reconnect_delay', () => {
  it('starts at half a second and doubles to a five second ceiling', () => {
    expect([0, 1, 2, 3, 4, 10].map(reconnect_delay)).toEqual([500, 1000, 2000, 4000, 5000, 5000]);
  });
});

describe('keep_connected', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports the link open once the first start succeeds', async () => {
    const { link } = fake_link(['ok']);
    const events = { on_open: vi.fn(), on_down: vi.fn() };

    keep_connected(link, events);
    await vi.advanceTimersByTimeAsync(0);

    expect(events.on_open).toHaveBeenCalledTimes(1);
    expect(events.on_down).not.toHaveBeenCalled();
  });

  it('retries a failed first start on the backoff schedule until it opens', async () => {
    const { link } = fake_link(['fail', 'fail', 'ok']);
    const events = { on_open: vi.fn(), on_down: vi.fn() };

    keep_connected(link, events);
    await vi.advanceTimersByTimeAsync(0);
    expect(events.on_down).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(499);
    expect(link.start).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(link.start).toHaveBeenCalledTimes(2);
    expect(events.on_down).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1000);
    expect(link.start).toHaveBeenCalledTimes(3);
    expect(events.on_open).toHaveBeenCalledTimes(1);
  });

  it('reports a drop and then the recovery, so the caller resyncs', async () => {
    const { link, drop, recover } = fake_link(['ok']);
    const events = { on_open: vi.fn(), on_down: vi.fn() };
    keep_connected(link, events);
    await vi.advanceTimersByTimeAsync(0);

    drop();
    expect(events.on_down).toHaveBeenCalledTimes(1);
    recover();
    expect(events.on_open).toHaveBeenCalledTimes(2);
  });

  it('starts again when the server closes the link outright', async () => {
    const { link, close } = fake_link(['ok', 'ok']);
    const events = { on_open: vi.fn(), on_down: vi.fn() };
    keep_connected(link, events);
    await vi.advanceTimersByTimeAsync(0);

    close();
    await vi.advanceTimersByTimeAsync(0);

    expect(events.on_down).toHaveBeenCalledTimes(1);
    expect(link.start).toHaveBeenCalledTimes(2);
    expect(events.on_open).toHaveBeenCalledTimes(2);
  });

  it('stops for good: no pending retry fires and the close it causes is not a drop', async () => {
    const { link } = fake_link(['fail', 'ok']);
    const events = { on_open: vi.fn(), on_down: vi.fn() };
    const stop = keep_connected(link, events);
    await vi.advanceTimersByTimeAsync(0);

    await stop();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(link.stop).toHaveBeenCalledTimes(1);
    expect(link.start).toHaveBeenCalledTimes(1);
    expect(events.on_down).toHaveBeenCalledTimes(1);
    expect(events.on_open).not.toHaveBeenCalled();
  });
});
