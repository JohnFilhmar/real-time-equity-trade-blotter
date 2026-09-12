import { describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import {
  problem_schema,
  trade_event_schema,
  trade_list_schema,
  trade_schema,
  trade_sort_columns,
  type Trade,
} from '@blotter/shared';
import { api_prefix, create_app } from '../app.js';
import type { HealthProbe } from '../interfaces/health_probe.js';
import { create_in_memory_trade_repository } from '../repositories/in_memory_trade_repository.js';
import { create_trade_service } from '../services/trade_service.js';

const reachable: HealthProbe = { check_connection: async () => undefined };

/** Where the trade resource lives, so a version bump is one edit here rather than thirty. */
const trades_path = `${api_prefix}/trades`;

/** A valid create body, matching the brief's own sample payload. */
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

/**
 * Builds an app backed by the in-memory repository, so the routes are exercised end to end
 * through Express, validation and the error middleware without needing a database.
 *
 * @returns The app, and the announcements the service made while handling the request.
 */
function build_app(): { app: Express; sent: string[] } {
  const sent: string[] = [];
  const service = create_trade_service(create_in_memory_trade_repository(), {
    trade_created: () => sent.push('trade.created'),
    trade_amended: () => sent.push('trade.amended'),
    trade_cancelled: () => sent.push('trade.cancelled'),
  });

  return {
    app: create_app({
      health_probe: reachable,
      trade_service: service,
      cors_origins: ['http://localhost:3000'],
    }),
    sent,
  };
}

/**
 * Creates a trade through the API so a test has something to amend or cancel.
 *
 * @param app - The app under test.
 * @returns The created trade.
 */
async function create_trade(app: Express): Promise<Trade> {
  const response = await request(app).post(trades_path).send(a_trade_body);
  return trade_schema.parse(response.body);
}

describe('API versioning', () => {
  it('serves the trade resource under the versioned prefix only', async () => {
    const { app } = build_app();

    expect((await request(app).get(trades_path)).status).toBe(200);
    expect((await request(app).get('/api/trades')).status).toBe(404);
  });
});

describe(`GET ${api_prefix}/trades`, () => {
  it('returns an envelope carrying the page, the total and the next cursor', async () => {
    const { app } = build_app();
    await create_trade(app);
    await create_trade(app);

    const response = await request(app).get(trades_path);

    expect(response.status).toBe(200);
    expect(() => trade_list_schema.parse(response.body)).not.toThrow();
    expect(response.body.total).toBe(2);
    expect(response.body.limit).toBe(100);
    expect(response.body.next_cursor).toBeNull();
    expect(response.body.data).toHaveLength(2);
  });

  it('hands back a cursor that fetches the rest without overlap', async () => {
    const { app } = build_app();
    await create_trade(app);
    await create_trade(app);
    await create_trade(app);

    const first = await request(app).get(`${trades_path}?limit=2`);
    const second = await request(app).get(
      `${trades_path}?limit=2&cursor=${String(first.body.next_cursor)}`,
    );

    const first_ids = first.body.data.map((trade: Trade) => trade.tradeId);
    const second_ids = second.body.data.map((trade: Trade) => trade.tradeId);

    expect(first_ids).toHaveLength(2);
    expect(second_ids).toHaveLength(1);
    expect(second_ids.filter((id: string) => first_ids.includes(id))).toEqual([]);
  });

  it('filters on counterparty', async () => {
    const { app } = build_app();
    await request(app).post(trades_path).send(a_trade_body);
    await request(app)
      .post(trades_path)
      .send({ ...a_trade_body, counterparty: 'JP Morgan' });

    const response = await request(app).get(`${trades_path}?counterparty=morgan`);

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(1);
    expect(response.body.data[0].counterparty).toBe('JP Morgan');
  });

  it('accepts every sort column the grid will offer', async () => {
    const { app } = build_app();
    await create_trade(app);

    for (const column of trade_sort_columns) {
      expect((await request(app).get(`${trades_path}?sort_by=${column}`)).status).toBe(200);
    }
  });

  it('rejects a query parameter outside its allowed range', async () => {
    const { app } = build_app();

    const response = await request(app).get(`${trades_path}?limit=5000`);

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('validation_failed');
  });
});

describe(`POST ${api_prefix}/trades`, () => {
  it('creates the trade, answers 201 and announces it', async () => {
    const { app, sent } = build_app();

    const response = await request(app).post(trades_path).send(a_trade_body);

    expect(response.status).toBe(201);
    expect(() => trade_schema.parse(response.body)).not.toThrow();
    expect(response.body.status).toBe('ACTIVE');
    expect(sent).toEqual(['trade.created']);
  });

  it('serialises price as a JSON number and stamps the instrument currency', async () => {
    const { app } = build_app();

    const response = await request(app).post(trades_path).send(a_trade_body);

    expect(typeof response.body.price).toBe('number');
    expect(response.body.price).toBe(227.45);
    expect(response.body.currency).toBe('USD');
  });

  it('rejects a symbol outside the tradable universe', async () => {
    const { app, sent } = build_app();

    const response = await request(app)
      .post(trades_path)
      .send({ ...a_trade_body, symbol: 'ZZZZ' });

    expect(response.status).toBe(422);
    expect(sent).toEqual([]);
  });

  it('rejects a trade booked in the future', async () => {
    const { app } = build_app();
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const response = await request(app)
      .post(trades_path)
      .send({ ...a_trade_body, tradeTimestamp: tomorrow });

    expect(response.status).toBe(422);
    expect(response.body.errors).toContainEqual(
      expect.objectContaining({ field: 'tradeTimestamp' }),
    );
  });

  it('rejects a ticket over the desk notional limit', async () => {
    const { app } = build_app();

    const response = await request(app)
      .post(trades_path)
      .send({ ...a_trade_body, quantity: 1_000_000, price: 100 });

    expect(response.status).toBe(422);
    expect(response.body.detail).toContain('desk limit');
  });

  it('rejects a negative quantity with field-level detail', async () => {
    const { app, sent } = build_app();

    const response = await request(app)
      .post(trades_path)
      .send({ ...a_trade_body, quantity: -1 });

    expect(response.status).toBe(422);
    expect(response.body.errors).toContainEqual(expect.objectContaining({ field: 'quantity' }));
    expect(sent).toEqual([]);
  });

  it('refuses a client-supplied status or currency', async () => {
    const { app } = build_app();

    const response = await request(app)
      .post(trades_path)
      .send({ ...a_trade_body, status: 'CANCELLED', currency: 'GBX' });

    expect(response.status).toBe(201);
    expect(response.body.status).toBe('ACTIVE');
    expect(response.body.currency).toBe('USD');
  });
});

describe(`PATCH ${api_prefix}/trades/:trade_id`, () => {
  it('amends the trade and announces it', async () => {
    const { app, sent } = build_app();
    const created = await create_trade(app);

    const response = await request(app)
      .patch(`${trades_path}/${created.tradeId}`)
      .send({ version: created.version, price: 230.1 });

    expect(response.status).toBe(200);
    expect(response.body.price).toBe(230.1);
    expect(response.body.version).toBe(2);
    expect(sent).toEqual(['trade.created', 'trade.amended']);
  });

  it('ignores an attempt to re-point the trade at another instrument', async () => {
    const { app } = build_app();
    const created = await create_trade(app);

    const response = await request(app)
      .patch(`${trades_path}/${created.tradeId}`)
      .send({ version: created.version, symbol: 'MSFT', side: 'SELL', quantity: 100 });

    expect(response.status).toBe(200);
    expect(response.body.symbol).toBe('AAPL');
    expect(response.body.side).toBe('BUY');
    expect(response.body.quantity).toBe(100);
  });

  it('answers 409 when the version is stale', async () => {
    const { app } = build_app();
    const created = await create_trade(app);
    await request(app)
      .patch(`${trades_path}/${created.tradeId}`)
      .send({ version: created.version, price: 230.1 });

    const response = await request(app)
      .patch(`${trades_path}/${created.tradeId}`)
      .send({ version: created.version, price: 240 });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('conflict');
  });

  it('answers 422 for a malformed trade id rather than 404', async () => {
    const { app } = build_app();

    const response = await request(app).patch(`${trades_path}/nonsense`).send({ version: 1 });

    expect(response.status).toBe(422);
  });
});

describe(`POST ${api_prefix}/trades/:trade_id/cancel`, () => {
  it('cancels the trade and announces it', async () => {
    const { app, sent } = build_app();
    const created = await create_trade(app);

    const response = await request(app).post(`${trades_path}/${created.tradeId}/cancel`).send({});

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('CANCELLED');
    expect(sent).toEqual(['trade.created', 'trade.cancelled']);
  });

  it('answers 409 on a second cancel', async () => {
    const { app } = build_app();
    const created = await create_trade(app);
    await request(app).post(`${trades_path}/${created.tradeId}/cancel`).send({});

    const response = await request(app).post(`${trades_path}/${created.tradeId}/cancel`).send({});

    expect(response.status).toBe(409);
  });

  it('answers 404 for a trade that does not exist', async () => {
    const { app } = build_app();

    const response = await request(app).post(`${trades_path}/TRD-999999/cancel`).send({});

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('not_found');
  });
});

describe(`GET ${api_prefix}/trades/:trade_id/events`, () => {
  it('answers an empty history for a trade that never changed', async () => {
    const { app } = build_app();
    const created = await create_trade(app);

    const response = await request(app).get(`${trades_path}/${created.tradeId}/events`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it('returns an amendment with both sides of every changed field', async () => {
    const { app } = build_app();
    const created = await create_trade(app);
    await request(app)
      .patch(`${trades_path}/${created.tradeId}`)
      .send({ version: 1, quantity: 7500 });

    const response = await request(app).get(`${trades_path}/${created.tradeId}/events`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(() => trade_event_schema.parse(response.body[0])).not.toThrow();
    expect(response.body[0].action).toBe('AMENDED');
    expect(response.body[0].source).toBe('API');
    expect(response.body[0].changes).toEqual({ quantity: { from: 5000, to: 7500 } });
  });

  it('records a cancellation too', async () => {
    const { app } = build_app();
    const created = await create_trade(app);
    await request(app).post(`${trades_path}/${created.tradeId}/cancel`).send({});

    const response = await request(app).get(`${trades_path}/${created.tradeId}/events`);

    expect(response.body).toHaveLength(1);
    expect(response.body[0].action).toBe('CANCELLED');
    expect(response.body[0].actor).toBe('JSMITH');
  });

  it('answers 404 for a trade that does not exist', async () => {
    const { app } = build_app();

    const response = await request(app).get(`${trades_path}/TRD-999999/events`);

    expect(response.status).toBe(404);
  });
});

describe('error shape', () => {
  it('is an RFC 9457 problem document on every failure', async () => {
    const { app } = build_app();

    const responses = [
      await request(app).get(`${trades_path}/TRD-999999`),
      await request(app).get(`${trades_path}?limit=5000`),
      await request(app).patch(`${trades_path}/nonsense`).send({ version: 1 }),
    ];

    for (const response of responses) {
      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(() => problem_schema.parse(response.body)).not.toThrow();
      expect(response.body.type).toMatch(/^\/problems\//);
      expect(response.body.status).toBe(response.status);
    }
  });

  it('carries the correlation id the response header advertises', async () => {
    const { app } = build_app();

    const response = await request(app)
      .get(`${trades_path}/TRD-999999`)
      .set('x-request-id', 'test-correlation-id');

    expect(response.headers['x-request-id']).toBe('test-correlation-id');
    expect(response.body.request_id).toBe('test-correlation-id');
  });
});
