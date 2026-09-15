import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import {
  problem_schema,
  trade_event_list_schema,
  trade_event_schema,
  trade_list_schema,
  trade_schema,
  trade_sort_columns,
  type Trade,
  type TradeEvent,
} from '@blotter/shared';
import { api_prefix } from '../app.js';
import { bearer, build_test_app, token_for } from '../lib/testing/test_app.js';

/** Where the trade resource lives, so a version bump is one edit here rather than thirty. */
const trades_path = `${api_prefix}/trades`;

/** The desk code most tests book under. */
const own_desk = 'JSMITH';

/** A valid create body. It carries no trader: that comes from the token. */
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
 * Creates a trade through the API so a test has something to amend or cancel.
 *
 * @param app - The app under test.
 * @param token - The bearer token to book under.
 * @returns The created trade.
 */
async function create_trade(app: Express, token: string): Promise<Trade> {
  const response = await request(app)
    .post(trades_path)
    .set('Authorization', bearer(token))
    .send(a_trade_body);

  return trade_schema.parse(response.body);
}

/**
 * Creates a trade and changes it three times, so the feed has a history to page through.
 *
 * The in-memory repository stamps each event from the clock, so the clock is moved a second
 * between writes. Three requests can otherwise land inside one millisecond, and two events with
 * the same timestamp are ordered by id, which is random.
 *
 * @param app - The app under test.
 * @param token - The bearer token to write under.
 * @returns The trade as created, before the changes.
 */
async function make_history(app: Express, token: string): Promise<Trade> {
  const created = await create_trade(app, token);
  const start = Date.now();
  vi.useFakeTimers({ toFake: ['Date'] });

  try {
    vi.setSystemTime(start);
    await request(app)
      .patch(`${trades_path}/${created.tradeId}`)
      .set('Authorization', bearer(token))
      .send({ version: 1, quantity: 100 });

    vi.setSystemTime(start + 1000);
    await request(app)
      .patch(`${trades_path}/${created.tradeId}`)
      .set('Authorization', bearer(token))
      .send({ version: 2, quantity: 200 });

    vi.setSystemTime(start + 2000);
    await request(app)
      .post(`${trades_path}/${created.tradeId}/cancel`)
      .set('Authorization', bearer(token))
      .send({});
  } finally {
    vi.useRealTimers();
  }

  return created;
}

describe('authentication', () => {
  it('refuses every trade route without a token', async () => {
    const { app } = build_test_app();

    const responses = [
      await request(app).get(trades_path),
      await request(app).get(`${trades_path}/TRD-100001`),
      await request(app).post(trades_path).send(a_trade_body),
      await request(app).patch(`${trades_path}/TRD-100001`).send({ version: 1, quantity: 1 }),
      await request(app).post(`${trades_path}/TRD-100001/cancel`).send({}),
      await request(app).get(`${trades_path}/TRD-100001/events`),
    ];

    for (const response of responses) {
      expect(response.status).toBe(401);
      expect(response.body.code).toBe('unauthenticated');
    }
  });

  it('refuses a token that is not ours', async () => {
    const { app } = build_test_app();

    const response = await request(app)
      .get(trades_path)
      .set('Authorization', 'Bearer not-a-real-token');

    expect(response.status).toBe(401);
  });

  it('refuses an Authorization header that is not a bearer', async () => {
    const { app } = build_test_app();

    const response = await request(app)
      .get(trades_path)
      .set('Authorization', `Basic ${Buffer.from('jsmith:password').toString('base64')}`);

    expect(response.status).toBe(401);
  });
});

describe('authorisation', () => {
  it('lets a viewer read but not write', async () => {
    const { app } = build_test_app();
    const viewer = bearer(token_for('VIEWER', 'VIEWER'));

    expect((await request(app).get(trades_path).set('Authorization', viewer)).status).toBe(200);

    const booked = await request(app)
      .post(trades_path)
      .set('Authorization', viewer)
      .send(a_trade_body);

    expect(booked.status).toBe(403);
    expect(booked.body.code).toBe('forbidden');
  });

  it("stops a trader amending somebody else's trade", async () => {
    const { app } = build_test_app();
    const mine = await create_trade(app, token_for(own_desk));

    const response = await request(app)
      .patch(`${trades_path}/${mine.tradeId}`)
      .set('Authorization', bearer(token_for('ABROWN')))
      .send({ version: 1, quantity: 100 });

    expect(response.status).toBe(403);
    expect(response.body.detail).toContain('JSMITH');
  });

  it("stops a trader cancelling another desk's trade", async () => {
    const { app } = build_test_app();
    const mine = await create_trade(app, token_for(own_desk));

    const response = await request(app)
      .post(`${trades_path}/${mine.tradeId}/cancel`)
      .set('Authorization', bearer(token_for('ABROWN')))
      .send({});

    expect(response.status).toBe(403);
  });

  it("lets an administrator act on anyone's trade", async () => {
    const { app } = build_test_app();
    const mine = await create_trade(app, token_for(own_desk));
    const admin = bearer(token_for('MJONES', 'ADMIN'));

    const amended = await request(app)
      .patch(`${trades_path}/${mine.tradeId}`)
      .set('Authorization', admin)
      .send({ version: 1, quantity: 100 });

    const cancelled = await request(app)
      .post(`${trades_path}/${mine.tradeId}/cancel`)
      .set('Authorization', admin)
      .send({});

    expect(amended.status).toBe(200);
    expect(cancelled.status).toBe(200);
  });
});

describe(`GET ${api_prefix}/trades`, () => {
  it('returns an envelope carrying the page, the total and the next cursor', async () => {
    const { app } = build_test_app();
    const token = token_for(own_desk);
    await create_trade(app, token);
    await create_trade(app, token);

    const response = await request(app).get(trades_path).set('Authorization', bearer(token));

    expect(response.status).toBe(200);
    expect(() => trade_list_schema.parse(response.body)).not.toThrow();
    expect(response.body.total).toBe(2);
    expect(response.body.next_cursor).toBeNull();
  });

  it('hands back a cursor that fetches the rest without overlap', async () => {
    const { app } = build_test_app();
    const token = token_for(own_desk);
    await create_trade(app, token);
    await create_trade(app, token);
    await create_trade(app, token);

    const first = await request(app)
      .get(`${trades_path}?limit=2`)
      .set('Authorization', bearer(token));
    const second = await request(app)
      .get(`${trades_path}?limit=2&cursor=${String(first.body.next_cursor)}`)
      .set('Authorization', bearer(token));

    const first_ids = first.body.data.map((trade: Trade) => trade.tradeId);
    const second_ids = second.body.data.map((trade: Trade) => trade.tradeId);

    expect(first_ids).toHaveLength(2);
    expect(second_ids).toHaveLength(1);
    expect(second_ids.filter((id: string) => first_ids.includes(id))).toEqual([]);
  });

  it('accepts every sort column the grid will offer', async () => {
    const { app } = build_test_app();
    const token = bearer(token_for(own_desk));
    await create_trade(app, token_for(own_desk));

    for (const column of trade_sort_columns) {
      const response = await request(app)
        .get(`${trades_path}?sort_by=${column}`)
        .set('Authorization', token);

      expect(response.status).toBe(200);
    }
  });

  it('rejects a query parameter outside its allowed range', async () => {
    const { app } = build_test_app();

    const response = await request(app)
      .get(`${trades_path}?limit=5000`)
      .set('Authorization', bearer(token_for(own_desk)));

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('validation_failed');
  });
});

describe(`POST ${api_prefix}/trades`, () => {
  it("books the trade under the token holder's desk code", async () => {
    const { app, sent } = build_test_app();

    const response = await request(app)
      .post(trades_path)
      .set('Authorization', bearer(token_for('ABROWN')))
      .send(a_trade_body);

    expect(response.status).toBe(201);
    expect(() => trade_schema.parse(response.body)).not.toThrow();
    expect(response.body.trader).toBe('ABROWN');
    expect(response.body.status).toBe('ACTIVE');
    expect(sent).toEqual(['trade.created', 'position.updated']);
  });

  it('ignores a trader the client tries to supply', async () => {
    const { app } = build_test_app();

    const response = await request(app)
      .post(trades_path)
      .set('Authorization', bearer(token_for('ABROWN')))
      .send({ ...a_trade_body, trader: 'SOMEONE_ELSE' });

    expect(response.status).toBe(201);
    expect(response.body.trader).toBe('ABROWN');
  });

  it('serialises price as a JSON number and stamps the instrument currency', async () => {
    const { app } = build_test_app();

    const response = await request(app)
      .post(trades_path)
      .set('Authorization', bearer(token_for(own_desk)))
      .send(a_trade_body);

    expect(typeof response.body.price).toBe('number');
    expect(response.body.currency).toBe('USD');
  });

  it('rejects a symbol outside the tradable universe', async () => {
    const { app, sent } = build_test_app();

    const response = await request(app)
      .post(trades_path)
      .set('Authorization', bearer(token_for(own_desk)))
      .send({ ...a_trade_body, symbol: 'ZZZZ' });

    expect(response.status).toBe(422);
    expect(sent).toEqual([]);
  });

  it('rejects a trade booked in the future', async () => {
    const { app } = build_test_app();
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const response = await request(app)
      .post(trades_path)
      .set('Authorization', bearer(token_for(own_desk)))
      .send({ ...a_trade_body, tradeTimestamp: tomorrow });

    expect(response.status).toBe(422);
    expect(response.body.errors).toContainEqual({
      field: 'tradeTimestamp',
      message: 'Trade time cannot be in the future',
    });
  });

  it('explains a broken rule in the words the ticket shows', async () => {
    const { app } = build_test_app();

    const response = await request(app)
      .post(trades_path)
      .set('Authorization', bearer(token_for(own_desk)))
      .send({ ...a_trade_body, quantity: 0, counterparty: '' });

    expect(response.status).toBe(422);
    expect(response.body.errors).toEqual([
      { field: 'quantity', message: 'Quantity must be a whole number above zero' },
      { field: 'counterparty', message: 'Enter a counterparty' },
    ]);
  });

  it('rejects a ticket over the desk notional limit', async () => {
    const { app } = build_test_app();

    const response = await request(app)
      .post(trades_path)
      .set('Authorization', bearer(token_for(own_desk)))
      .send({ ...a_trade_body, quantity: 1_000_000, price: 100 });

    expect(response.status).toBe(422);
    expect(response.body.detail).toContain('desk limit');
  });
});

describe(`PATCH ${api_prefix}/trades/:trade_id`, () => {
  it('amends the trade and announces it', async () => {
    const { app, sent } = build_test_app();
    const token = token_for(own_desk);
    const created = await create_trade(app, token);

    const response = await request(app)
      .patch(`${trades_path}/${created.tradeId}`)
      .set('Authorization', bearer(token))
      .send({ version: created.version, price: 230.1 });

    expect(response.status).toBe(200);
    expect(response.body.price).toBe(230.1);
    expect(response.body.version).toBe(2);
    expect(sent).toEqual([
      'trade.created',
      'position.updated',
      'trade.amended',
      'trade_event.recorded',
      'position.updated',
    ]);
  });

  it('ignores an attempt to re-point the trade at another instrument', async () => {
    const { app } = build_test_app();
    const token = token_for(own_desk);
    const created = await create_trade(app, token);

    const response = await request(app)
      .patch(`${trades_path}/${created.tradeId}`)
      .set('Authorization', bearer(token))
      .send({ version: created.version, symbol: 'MSFT', side: 'SELL', quantity: 100 });

    expect(response.status).toBe(200);
    expect(response.body.symbol).toBe('AAPL');
    expect(response.body.side).toBe('BUY');
    expect(response.body.quantity).toBe(100);
  });

  it('answers 422 naming the counterparty, and changes nothing, when an amendment tries to move it', async () => {
    const { app, sent } = build_test_app();
    const token = token_for(own_desk);
    const created = await create_trade(app, token);

    const response = await request(app)
      .patch(`${trades_path}/${created.tradeId}`)
      .set('Authorization', bearer(token))
      .send({ version: created.version, quantity: 100, counterparty: 'Nomura' });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('validation_failed');
    expect(response.body.errors).toEqual([
      {
        field: 'counterparty',
        message: 'Counterparty cannot be changed on an amendment. Cancel the trade and book it again.',
      },
    ]);
    expect(sent).toEqual(['trade.created', 'position.updated']);

    const stored = await request(app)
      .get(`${trades_path}/${created.tradeId}`)
      .set('Authorization', bearer(token));

    expect(stored.body.counterparty).toBe('Goldman Sachs');
    expect(stored.body.quantity).toBe(5000);
    expect(stored.body.version).toBe(1);
  });

  it('answers 409 when the version is stale', async () => {
    const { app } = build_test_app();
    const token = token_for(own_desk);
    const created = await create_trade(app, token);
    await request(app)
      .patch(`${trades_path}/${created.tradeId}`)
      .set('Authorization', bearer(token))
      .send({ version: created.version, price: 230.1 });

    const response = await request(app)
      .patch(`${trades_path}/${created.tradeId}`)
      .set('Authorization', bearer(token))
      .send({ version: created.version, price: 240 });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('conflict');
  });

  it('answers 422 for a malformed trade id rather than 404', async () => {
    const { app } = build_test_app();

    const response = await request(app)
      .patch(`${trades_path}/nonsense`)
      .set('Authorization', bearer(token_for(own_desk)))
      .send({ version: 1 });

    expect(response.status).toBe(422);
  });
});

describe(`POST ${api_prefix}/trades/:trade_id/cancel`, () => {
  it('cancels the trade and announces it', async () => {
    const { app, sent } = build_test_app();
    const token = token_for(own_desk);
    const created = await create_trade(app, token);

    const response = await request(app)
      .post(`${trades_path}/${created.tradeId}/cancel`)
      .set('Authorization', bearer(token))
      .send({});

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('CANCELLED');
    expect(sent).toEqual([
      'trade.created',
      'position.updated',
      'trade.cancelled',
      'trade_event.recorded',
      'position.updated',
    ]);
  });

  it('answers 409 on a second cancel', async () => {
    const { app } = build_test_app();
    const token = token_for(own_desk);
    const created = await create_trade(app, token);
    await request(app)
      .post(`${trades_path}/${created.tradeId}/cancel`)
      .set('Authorization', bearer(token))
      .send({});

    const response = await request(app)
      .post(`${trades_path}/${created.tradeId}/cancel`)
      .set('Authorization', bearer(token))
      .send({});

    expect(response.status).toBe(409);
  });

  it('answers 404 for a trade that does not exist', async () => {
    const { app } = build_test_app();

    const response = await request(app)
      .post(`${trades_path}/TRD-999999/cancel`)
      .set('Authorization', bearer(token_for(own_desk)))
      .send({});

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('not_found');
  });
});

describe(`GET ${api_prefix}/trades/:trade_id/events`, () => {
  it('answers an empty history for a trade that never changed', async () => {
    const { app } = build_test_app();
    const token = token_for(own_desk);
    const created = await create_trade(app, token);

    const response = await request(app)
      .get(`${trades_path}/${created.tradeId}/events`)
      .set('Authorization', bearer(token));

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it('records the amendment against whoever made it', async () => {
    const { app } = build_test_app();
    const token = token_for(own_desk);
    const created = await create_trade(app, token);
    await request(app)
      .patch(`${trades_path}/${created.tradeId}`)
      .set('Authorization', bearer(token))
      .send({ version: 1, quantity: 7500 });

    const response = await request(app)
      .get(`${trades_path}/${created.tradeId}/events`)
      .set('Authorization', bearer(token));

    expect(response.body).toHaveLength(1);
    expect(() => trade_event_schema.parse(response.body[0])).not.toThrow();
    expect(response.body[0].action).toBe('AMENDED');
    expect(response.body[0].source).toBe('API');
    expect(response.body[0].actor).toBe(own_desk);
    expect(response.body[0].changes).toEqual({ quantity: { from: 5000, to: 7500 } });
  });

  it('records who cancelled a trade, even when it was an administrator', async () => {
    const { app } = build_test_app();
    const created = await create_trade(app, token_for(own_desk));
    await request(app)
      .post(`${trades_path}/${created.tradeId}/cancel`)
      .set('Authorization', bearer(token_for('MJONES', 'ADMIN')))
      .send({});

    const response = await request(app)
      .get(`${trades_path}/${created.tradeId}/events`)
      .set('Authorization', bearer(token_for(own_desk)));

    expect(response.body[0].action).toBe('CANCELLED');
    expect(response.body[0].actor).toBe('MJONES');
  });
});

describe(`GET ${api_prefix}/trades/events`, () => {
  it('refuses the request without a token', async () => {
    const { app } = build_test_app();

    const response = await request(app).get(`${trades_path}/events`);

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('unauthenticated');
  });

  it('lets a viewer read, and the envelope satisfies the shared contract', async () => {
    const { app } = build_test_app();
    const created = await make_history(app, token_for(own_desk));

    const response = await request(app)
      .get(`${trades_path}/events`)
      .set('Authorization', bearer(token_for('VIEWER', 'VIEWER')));

    expect(response.status).toBe(200);
    expect(() => trade_event_list_schema.parse(response.body)).not.toThrow();
    expect(response.body.total).toBe(3);
    expect(response.body.next_cursor).toBeNull();
    expect(response.body.data.every((event: TradeEvent) => event.tradeId === created.tradeId)).toBe(
      true,
    );
  });

  it('lists the newest event first', async () => {
    const { app } = build_test_app();
    const token = token_for(own_desk);
    await make_history(app, token);

    const response = await request(app)
      .get(`${trades_path}/events`)
      .set('Authorization', bearer(token));

    expect(response.body.data.map((event: TradeEvent) => event.version)).toEqual([4, 3, 2]);
    expect(response.body.data[0].action).toBe('CANCELLED');
  });

  it('respects the limit', async () => {
    const { app } = build_test_app();
    const token = token_for(own_desk);
    await make_history(app, token);

    const response = await request(app)
      .get(`${trades_path}/events?limit=2`)
      .set('Authorization', bearer(token));

    expect(response.body.data).toHaveLength(2);
    expect(response.body.limit).toBe(2);
    expect(response.body.total).toBe(3);
    expect(response.body.next_cursor).not.toBeNull();
  });

  it('hands back a cursor that fetches the rest without overlap and then ends', async () => {
    const { app } = build_test_app();
    const token = token_for(own_desk);
    await make_history(app, token);

    const first = await request(app)
      .get(`${trades_path}/events?limit=2`)
      .set('Authorization', bearer(token));
    const second = await request(app)
      .get(`${trades_path}/events?limit=2&cursor=${String(first.body.next_cursor)}`)
      .set('Authorization', bearer(token));

    const first_ids = first.body.data.map((event: TradeEvent) => event.id);
    const second_ids = second.body.data.map((event: TradeEvent) => event.id);

    expect(second_ids).toHaveLength(1);
    expect(second_ids.filter((id: string) => first_ids.includes(id))).toEqual([]);
    expect(second.body.data[0].version).toBe(2);
    expect(second.body.next_cursor).toBeNull();
  });
});

describe('error shape', () => {
  it('is an RFC 9457 problem document on every failure', async () => {
    const { app } = build_test_app();
    const token = bearer(token_for(own_desk));

    const responses = [
      await request(app).get(`${trades_path}/TRD-999999`).set('Authorization', token),
      await request(app).get(`${trades_path}?limit=5000`).set('Authorization', token),
      await request(app).get(trades_path),
    ];

    for (const response of responses) {
      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(() => problem_schema.parse(response.body)).not.toThrow();
      expect(response.body.type).toMatch(/^\/problems\//);
      expect(response.body.status).toBe(response.status);
    }
  });

  it('carries the correlation id the response header advertises', async () => {
    const { app } = build_test_app();

    const response = await request(app)
      .get(`${trades_path}/TRD-999999`)
      .set('Authorization', bearer(token_for(own_desk)))
      .set('x-request-id', 'test-correlation-id');

    expect(response.headers['x-request-id']).toBe('test-correlation-id');
    expect(response.body.request_id).toBe('test-correlation-id');
  });
});
