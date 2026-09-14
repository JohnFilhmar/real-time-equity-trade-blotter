import type { Server as HttpServer } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { z } from 'zod';
import {
  broadcast_envelope_schema,
  instrument_symbols,
  mark_set_schema,
  position_envelope_schema,
  trade_event_envelope_schema,
  trade_events,
  type BroadcastEnvelope,
} from '@blotter/shared';
import { api_prefix, create_app } from '../app.js';
import {
  create_in_memory_login_attempts,
  create_in_memory_refresh_store,
} from '../lib/auth/in_memory_auth_stores.js';
import { create_http_server } from '../lib/http/create_http_server.js';
import { create_mark_store } from '../lib/marks/mark_store.js';
import { bearer, token_for } from '../lib/testing/test_app.js';
import { create_in_memory_trade_repository } from '../repositories/in_memory_trade_repository/index.js';
import { create_in_memory_user_repository } from '../repositories/in_memory_user_repository.js';
import { create_auth_service } from '../services/auth_service.js';
import { create_trade_service } from '../services/trade_service/index.js';
import { create_socket_broadcaster } from './socket_broadcaster.js';
import { create_socket_server } from './socket_server.js';

/** The origin the server is configured to accept, per the test environment's CORS_ORIGINS. */
const allowed_origin = 'http://localhost:3000';

/** The desk code every request in this suite is made under. */
const own_desk = 'JSMITH';

/** One access token, reused, because the subject here is the broadcast rather than the login. */
const access_token = token_for(own_desk);

/** The one field every enveloped broadcast shares, for reading the sequence off any of them. */
const sequenced_schema = z.object({ seq: z.int().nonnegative() });

/** One message a tab was sent, as it arrived, before any parsing. */
interface Delivery {
  event: string;
  payload: unknown;
}

/** A client standing in for one browser tab. */
interface Tab {
  socket: Socket;
  received: Delivery[];
}

let http_server: HttpServer;
let base_url: string;
const open_sockets: Socket[] = [];

/**
 * Connects a client and records everything it is sent.
 *
 * @param origin - The Origin header to present, so the rejection path can be exercised too.
 * @param token - The access token to present, or `null` to present none.
 * @returns The connected tab.
 */
async function open_tab(origin = allowed_origin, token: string | null = access_token): Promise<Tab> {
  const socket = connect(base_url, {
    transports: ['websocket'],
    extraHeaders: { Origin: origin },
    ...(token === null ? {} : { auth: { token } }),
    reconnection: false,
  });
  open_sockets.push(socket);

  const received: Delivery[] = [];
  for (const event of Object.values(trade_events)) {
    socket.on(event, (payload: unknown) => {
      received.push({ event, payload });
    });
  }

  await new Promise<void>((resolve, reject) => {
    socket.on('connect', () => {
      resolve();
    });
    socket.on('connect_error', reject);
  });

  return { socket, received };
}

/**
 * Pauses briefly, so a poll does not spin.
 *
 * @param ms - How long to pause for.
 */
async function pause(ms = 20): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The trade a delivery carries, or `null` when the message was not a trade broadcast.
 *
 * @param entry - The delivery.
 * @returns The business identifier of the trade inside.
 */
function trade_id_of(entry: Delivery): string | null {
  const parsed = broadcast_envelope_schema.safeParse(entry.payload);
  return parsed.success ? parsed.data.trade.tradeId : null;
}

/**
 * The sequence number a delivery carries, or `null` for a bare payload such as a mark set.
 *
 * @param entry - The delivery.
 * @returns Its position in the stream.
 */
function seq_of(entry: Delivery): number | null {
  const parsed = sequenced_schema.safeParse(entry.payload);
  return parsed.success ? parsed.data.seq : null;
}

/**
 * Waits for one tab to see a specific trade event for a specific trade.
 *
 * Polling rather than a one-shot listener because the live path is asynchronous and a test that
 * asserts immediately after the HTTP call passes or fails on timing rather than on behaviour.
 *
 * @param tab - The tab to watch.
 * @param event - The event name expected.
 * @param trade_id - The trade it should concern.
 * @param timeout_ms - How long to wait before giving up.
 * @returns The envelope, or `null` if it never arrived.
 */
async function wait_for(
  tab: Tab,
  event: string,
  trade_id: string,
  timeout_ms = 3000,
): Promise<BroadcastEnvelope | null> {
  const deadline = Date.now() + timeout_ms;

  while (Date.now() < deadline) {
    const hit = tab.received.find(
      (entry) => entry.event === event && trade_id_of(entry) === trade_id,
    );

    if (hit !== undefined) {
      return broadcast_envelope_schema.parse(hit.payload);
    }

    await pause();
  }

  return null;
}

/**
 * Waits until a tab has been sent at least `count` messages, or the timeout passes.
 *
 * @param tab - The tab to watch.
 * @param count - How many messages to wait for.
 * @param timeout_ms - How long to wait before giving up.
 */
async function wait_for_count(tab: Tab, count: number, timeout_ms = 3000): Promise<void> {
  const deadline = Date.now() + timeout_ms;

  while (tab.received.length < count && Date.now() < deadline) {
    await pause();
  }
}

/**
 * Calls the API over the network, as a browser would.
 *
 * @param method - HTTP method.
 * @param path - Path below the versioned prefix.
 * @param body - JSON body, if any.
 * @returns Status and parsed body.
 */
async function call(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`${base_url}${api_prefix}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      origin: allowed_origin,
      authorization: bearer(access_token),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  const parsed: unknown = await response.json();
  return {
    status: response.status,
    body: typeof parsed === 'object' && parsed !== null ? { ...parsed } : {},
  };
}

const a_trade_body = {
  symbol: 'AAPL',
  side: 'BUY',
  quantity: 5000,
  price: 227.45,
  book: 'EQUITIES_UK',
  counterparty: 'Goldman Sachs',
  tradeTimestamp: '2026-08-18T09:15:23.000Z',
};

/**
 * Books a trade and waits until the tab has seen everything a booking produces, so the tab's
 * message count is a known baseline for what the test does next.
 *
 * A fresh tab has already been sent the marks, so the wait for one message first is what stops the
 * baseline landing before they arrive.
 *
 * @param tab - The tab to settle.
 * @returns The new trade's identifier and the index the next message will land at.
 */
async function book_and_settle(tab: Tab): Promise<{ trade_id: string; next: number }> {
  await wait_for_count(tab, 1);
  const baseline = tab.received.length;

  const created = await call('POST', '/trades', a_trade_body);
  expect(created.status).toBe(201);
  await wait_for_count(tab, baseline + 2);

  return { trade_id: String(created.body.tradeId), next: baseline + 2 };
}

beforeAll(async () => {
  // Built the same way index.ts builds it: the mark store, the HTTP server with its request slot,
  // the socket server, the broadcaster, the service, then the app installed into the slot. Only the
  // repository is swapped, because the thing under test is the broadcast path rather than persistence.
  const composed = create_http_server();
  http_server = composed.server;
  const socket_server = create_socket_server(http_server, create_mark_store());
  const service = create_trade_service(
    create_in_memory_trade_repository(),
    create_socket_broadcaster(socket_server),
  );

  composed.serve(
    create_app({
      health_probe: { check_connection: async () => undefined },
      trade_service: service,
      auth_service: create_auth_service(
        create_in_memory_user_repository(),
        create_in_memory_refresh_store(),
        create_in_memory_login_attempts(),
      ),
      cors_origins: [allowed_origin],
    }),
  );

  await new Promise<void>((resolve) => {
    http_server.listen(0, () => {
      resolve();
    });
  });

  const address = http_server.address();

  if (address === null || typeof address === 'string') {
    throw new Error('server did not bind to a port');
  }

  base_url = `http://127.0.0.1:${address.port.toString()}`;
});

afterAll(async () => {
  for (const socket of open_sockets) {
    socket.close();
  }

  await new Promise<void>((resolve) => {
    http_server.close(() => {
      resolve();
    });
  });
});

describe('a change made by one client reaches every other client', () => {
  it('delivers a created trade to a second, uninvolved tab', async () => {
    const tab_a = await open_tab();
    const tab_b = await open_tab();

    const created = await call('POST', '/trades', a_trade_body);
    expect(created.status).toBe(201);
    const trade_id = String(created.body.tradeId);

    const seen_by_a = await wait_for(tab_a, 'trade.created', trade_id);
    const seen_by_b = await wait_for(tab_b, 'trade.created', trade_id);

    expect(seen_by_a).not.toBeNull();
    expect(seen_by_b).not.toBeNull();
    expect(seen_by_b?.trade.quantity).toBe(5000);
  });

  it('delivers an amendment and a cancellation to both tabs', async () => {
    const tab_a = await open_tab();
    const tab_b = await open_tab();

    const created = await call('POST', '/trades', a_trade_body);
    const trade_id = String(created.body.tradeId);
    await wait_for(tab_a, 'trade.created', trade_id);

    await call('PATCH', `/trades/${trade_id}`, { version: 1, quantity: 7500 });
    await call('POST', `/trades/${trade_id}/cancel`, {});

    const amended = await wait_for(tab_b, 'trade.amended', trade_id);
    const cancelled = await wait_for(tab_a, 'trade.cancelled', trade_id);

    expect(amended?.trade.quantity).toBe(7500);
    expect(cancelled?.trade.status).toBe('CANCELLED');
  });

  it('wraps every broadcast in the published envelope', async () => {
    const tab = await open_tab();

    const created = await call('POST', '/trades', a_trade_body);
    const envelope = await wait_for(tab, 'trade.created', String(created.body.tradeId));

    expect(envelope).not.toBeNull();
    expect(() => broadcast_envelope_schema.parse(envelope)).not.toThrow();
  });

  it('numbers events so a client can tell it missed one', async () => {
    const tab = await open_tab();
    const before = tab.received.length;

    const first = await call('POST', '/trades', a_trade_body);
    await wait_for(tab, 'trade.created', String(first.body.tradeId));
    const second = await call('POST', '/trades', a_trade_body);
    await wait_for(tab, 'trade.created', String(second.body.tradeId));

    const sequences = tab.received
      .slice(before)
      .map(seq_of)
      .filter((seq): seq is number => seq !== null);

    expect(sequences.length).toBeGreaterThanOrEqual(2);
    for (let index = 1; index < sequences.length; index += 1) {
      expect(sequences[index]).toBe((sequences[index - 1] ?? 0) + 1);
    }
  });

  it('stamps each broadcast with the time it left the server', async () => {
    const tab = await open_tab();

    const created = await call('POST', '/trades', a_trade_body);
    const envelope = await wait_for(tab, 'trade.created', String(created.body.tradeId));

    const emitted_at = Date.parse(envelope?.emitted_at ?? '');
    expect(Number.isNaN(emitted_at)).toBe(false);
    expect(Math.abs(Date.now() - emitted_at)).toBeLessThan(10_000);
  });

  it('sends nothing when a write is refused', async () => {
    const tab = await open_tab();
    await wait_for_count(tab, 1);
    const before = tab.received.length;

    const rejected = await call('POST', '/trades', { ...a_trade_body, quantity: -1 });
    expect(rejected.status).toBe(422);

    await pause(200);
    expect(tab.received).toHaveLength(before);
  });
});

describe('every write is followed by what a client needs to keep its book current', () => {
  it('delivers a booking as the trade then the position, with no audit event', async () => {
    const tab = await open_tab();

    const { trade_id, next } = await book_and_settle(tab);
    await pause(100);

    const [trade, position] = tab.received.slice(next - 2);
    expect(tab.received).toHaveLength(next);
    expect(trade?.event).toBe('trade.created');
    expect(broadcast_envelope_schema.parse(trade?.payload).trade.tradeId).toBe(trade_id);
    expect(position?.event).toBe('position.updated');
    expect(position_envelope_schema.parse(position?.payload).position.symbol).toBe('AAPL');
  });

  it('delivers an amendment to a second tab as the trade, its audit event, then the position, numbered in that order', async () => {
    await open_tab();
    const tab = await open_tab();
    const { trade_id, next } = await book_and_settle(tab);

    await call('PATCH', `/trades/${trade_id}`, { version: 1, quantity: 7500 });
    await wait_for_count(tab, next + 3);

    const [first, second, third] = tab.received.slice(next, next + 3);
    expect(first?.event).toBe('trade.amended');
    const trade = broadcast_envelope_schema.parse(first?.payload);
    expect(trade.trade).toMatchObject({ tradeId: trade_id, quantity: 7500 });

    expect(second?.event).toBe('trade_event.recorded');
    const audit = trade_event_envelope_schema.parse(second?.payload);
    expect(audit.event).toMatchObject({ action: 'AMENDED', tradeId: trade_id });

    expect(third?.event).toBe('position.updated');
    const position = position_envelope_schema.parse(third?.payload);
    expect(position.position.symbol).toBe('AAPL');

    expect([audit.seq, position.seq]).toEqual([trade.seq + 1, trade.seq + 2]);
  });

  it('delivers a cancellation the same way, with the audit event marked CANCELLED', async () => {
    await open_tab();
    const tab = await open_tab();
    const { trade_id, next } = await book_and_settle(tab);

    await call('POST', `/trades/${trade_id}/cancel`, {});
    await wait_for_count(tab, next + 3);

    const [first, second, third] = tab.received.slice(next, next + 3);
    expect(first?.event).toBe('trade.cancelled');
    const trade = broadcast_envelope_schema.parse(first?.payload);
    expect(trade.trade).toMatchObject({ tradeId: trade_id, status: 'CANCELLED' });

    expect(second?.event).toBe('trade_event.recorded');
    const audit = trade_event_envelope_schema.parse(second?.payload);
    expect(audit.event).toMatchObject({ action: 'CANCELLED', tradeId: trade_id });

    expect(third?.event).toBe('position.updated');
    const position = position_envelope_schema.parse(third?.payload);
    expect(position.position.symbol).toBe('AAPL');

    expect([audit.seq, position.seq]).toEqual([trade.seq + 1, trade.seq + 2]);
  });

  it('sends the current marks to a client as soon as it connects', async () => {
    const tab = await open_tab();
    await wait_for_count(tab, 1);

    const [first] = tab.received;
    expect(first?.event).toBe('mark.updated');

    const marks = mark_set_schema.parse(first?.payload);
    for (const symbol of instrument_symbols) {
      expect(marks[symbol]).toBeGreaterThan(0);
    }
  });
});

describe('socket handshake', () => {
  it('refuses a websocket from an origin that is not on the allowlist', async () => {
    await expect(open_tab('http://evil.example')).rejects.toThrow();
  });

  it('refuses a socket with no token', async () => {
    // Broadcasts carry whole trades, so an unauthenticated socket would stream the blotter to
    // anyone who opened one and make the authorisation on the read endpoints decorative.
    await expect(open_tab(allowed_origin, null)).rejects.toThrow();
  });

  it('refuses a socket whose token is not ours', async () => {
    await expect(open_tab(allowed_origin, 'not-a-real-token')).rejects.toThrow();
  });

  it('accepts a viewer, who is allowed to read', async () => {
    const tab = await open_tab(allowed_origin, token_for('VIEWER', 'VIEWER'));

    expect(tab.socket.connected).toBe(true);
  });
});
