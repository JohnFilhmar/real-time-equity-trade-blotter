import { createServer, type Server as HttpServer } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { broadcast_envelope_schema, type BroadcastEnvelope } from '@blotter/shared';
import { api_prefix, create_app } from '../app.js';
import { create_in_memory_trade_repository } from '../repositories/in_memory_trade_repository.js';
import { create_trade_service } from '../services/trade_service.js';
import { create_socket_broadcaster } from './socket_broadcaster.js';
import { create_socket_server } from './socket_server.js';

/** The origin the server is configured to accept, per the test environment's CORS_ORIGINS. */
const allowed_origin = 'http://localhost:3000';

/** A client standing in for one browser tab. */
interface Tab {
  socket: Socket;
  received: { event: string; envelope: BroadcastEnvelope }[];
}

let http_server: HttpServer;
let base_url: string;
const open_sockets: Socket[] = [];

/**
 * Connects a client and records everything it is sent.
 *
 * @param origin - The Origin header to present, so the rejection path can be exercised too.
 * @returns The connected tab.
 */
async function open_tab(origin = allowed_origin): Promise<Tab> {
  const socket = connect(base_url, {
    transports: ['websocket'],
    extraHeaders: { Origin: origin },
    reconnection: false,
  });
  open_sockets.push(socket);

  const received: Tab['received'] = [];
  for (const event of ['trade.created', 'trade.amended', 'trade.cancelled'] as const) {
    socket.on(event, (envelope: BroadcastEnvelope) => {
      received.push({ event, envelope });
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
 * Waits for one tab to see a specific event for a specific trade.
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
      (entry) => entry.event === event && entry.envelope.trade.tradeId === trade_id,
    );

    if (hit !== undefined) {
      return hit.envelope;
    }

    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  return null;
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
    headers: { 'content-type': 'application/json', origin: allowed_origin },
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
  trader: 'JSMITH',
  book: 'EQUITIES_UK',
  counterparty: 'Goldman Sachs',
  tradeTimestamp: '2026-08-18T09:15:23.000Z',
};

beforeAll(async () => {
  // Built the same way index.ts builds it: the HTTP server first, then the socket server, then the
  // broadcaster, then the service, then the app. Only the repository is swapped, because the thing
  // under test is the broadcast path rather than persistence.
  http_server = createServer();
  const socket_server = create_socket_server(http_server);
  const service = create_trade_service(
    create_in_memory_trade_repository(),
    create_socket_broadcaster(socket_server),
  );

  http_server.on(
    'request',
    create_app({
      health_probe: { check_connection: async () => undefined },
      trade_service: service,
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

    const sequences = tab.received.slice(before).map((entry) => entry.envelope.seq);

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
    const before = tab.received.length;

    const rejected = await call('POST', '/trades', { ...a_trade_body, quantity: -1 });
    expect(rejected.status).toBe(422);

    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(tab.received).toHaveLength(before);
  });
});

describe('socket origin check', () => {
  it('refuses a websocket from an origin that is not on the allowlist', async () => {
    await expect(open_tab('http://evil.example')).rejects.toThrow();
  });
});
