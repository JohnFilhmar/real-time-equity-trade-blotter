import { describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import {
  trade_amendment_schema,
  trade_schema,
  trade_sort_columns,
  type Trade,
} from '@blotter/shared';
import { create_app } from '../app.js';
import type { HealthProbe } from '../interfaces/health_probe.js';
import { create_in_memory_trade_repository } from '../repositories/in_memory_trade_repository.js';
import { create_trade_service } from '../services/trade_service.js';

const reachable: HealthProbe = { check_connection: async () => undefined };

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
  const response = await request(app).post('/api/trades').send(a_trade_body);
  return trade_schema.parse(response.body);
}

describe('GET /api/trades', () => {
  it('returns an envelope carrying the page and the total', async () => {
    const { app } = build_app();
    await create_trade(app);
    await create_trade(app);

    const response = await request(app).get('/api/trades');

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(2);
    expect(response.body.limit).toBe(100);
    expect(response.body.offset).toBe(0);
    expect(response.body.data).toHaveLength(2);
  });

  it('rejects a query parameter outside its allowed range', async () => {
    const { app } = build_app();

    const response = await request(app).get('/api/trades?limit=5000');

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('validation_failed');
  });
});

describe('POST /api/trades', () => {
  it('creates the trade, answers 201 and announces it', async () => {
    const { app, sent } = build_app();

    const response = await request(app).post('/api/trades').send(a_trade_body);

    expect(response.status).toBe(201);
    expect(() => trade_schema.parse(response.body)).not.toThrow();
    expect(response.body.status).toBe('ACTIVE');
    expect(sent).toEqual(['trade.created']);
  });

  it('serialises price as a JSON number rather than an object', async () => {
    const { app } = build_app();

    const response = await request(app).post('/api/trades').send(a_trade_body);

    expect(typeof response.body.price).toBe('number');
    expect(response.body.price).toBe(227.45);
  });

  it('rejects a negative quantity with field-level detail', async () => {
    const { app, sent } = build_app();

    const response = await request(app)
      .post('/api/trades')
      .send({ ...a_trade_body, quantity: -1 });

    expect(response.status).toBe(422);
    expect(response.body.error.details).toContainEqual(
      expect.objectContaining({ field: 'quantity' }),
    );
    expect(sent).toEqual([]);
  });

  it('refuses a client-supplied status', async () => {
    const { app } = build_app();

    const response = await request(app)
      .post('/api/trades')
      .send({ ...a_trade_body, status: 'CANCELLED' });

    expect(response.status).toBe(201);
    expect(response.body.status).toBe('ACTIVE');
  });
});

describe('PATCH /api/trades/:trade_id', () => {
  it('amends the trade and announces it', async () => {
    const { app, sent } = build_app();
    const created = await create_trade(app);

    const response = await request(app)
      .patch(`/api/trades/${created.tradeId}`)
      .send({ version: created.version, price: 230.1 });

    expect(response.status).toBe(200);
    expect(response.body.price).toBe(230.1);
    expect(response.body.version).toBe(2);
    expect(sent).toEqual(['trade.created', 'trade.amended']);
  });

  it('answers 409 when the version is stale', async () => {
    const { app } = build_app();
    const created = await create_trade(app);
    await request(app)
      .patch(`/api/trades/${created.tradeId}`)
      .send({ version: created.version, price: 230.1 });

    const response = await request(app)
      .patch(`/api/trades/${created.tradeId}`)
      .send({ version: created.version, price: 240 });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('conflict');
  });

  it('answers 422 for a malformed trade id rather than 404', async () => {
    const { app } = build_app();

    const response = await request(app).patch('/api/trades/nonsense').send({ version: 1 });

    expect(response.status).toBe(422);
  });
});

describe('POST /api/trades/:trade_id/cancel', () => {
  it('cancels the trade and announces it', async () => {
    const { app, sent } = build_app();
    const created = await create_trade(app);

    const response = await request(app).post(`/api/trades/${created.tradeId}/cancel`).send({});

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('CANCELLED');
    expect(sent).toEqual(['trade.created', 'trade.cancelled']);
  });

  it('answers 409 on a second cancel', async () => {
    const { app } = build_app();
    const created = await create_trade(app);
    await request(app).post(`/api/trades/${created.tradeId}/cancel`).send({});

    const response = await request(app).post(`/api/trades/${created.tradeId}/cancel`).send({});

    expect(response.status).toBe(409);
  });

  it('answers 404 for a trade that does not exist', async () => {
    const { app } = build_app();

    const response = await request(app).post('/api/trades/TRD-999999/cancel').send({});

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('not_found');
  });
});

describe('GET /api/trades/:trade_id/amendments', () => {
  it('answers an empty history for a trade that was never amended', async () => {
    const { app } = build_app();
    const created = await create_trade(app);

    const response = await request(app).get(`/api/trades/${created.tradeId}/amendments`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it('returns each amendment with both sides of every changed field', async () => {
    const { app } = build_app();
    const created = await create_trade(app);
    await request(app)
      .patch(`/api/trades/${created.tradeId}`)
      .send({ version: 1, quantity: 7500 });

    const response = await request(app).get(`/api/trades/${created.tradeId}/amendments`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(() => trade_amendment_schema.parse(response.body[0])).not.toThrow();
    expect(response.body[0].changes).toEqual({ quantity: { from: 5000, to: 7500 } });
    expect(response.body[0].version).toBe(2);
  });

  it('answers 404 for a trade that does not exist', async () => {
    const { app } = build_app();

    const response = await request(app).get('/api/trades/TRD-999999/amendments');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('not_found');
  });

  it('answers 422 for a malformed trade id', async () => {
    const { app } = build_app();

    const response = await request(app).get('/api/trades/nonsense/amendments');

    expect(response.status).toBe(422);
  });
});

describe('widened list query', () => {
  it('filters on counterparty', async () => {
    const { app } = build_app();
    await request(app).post('/api/trades').send(a_trade_body);
    await request(app)
      .post('/api/trades')
      .send({ ...a_trade_body, counterparty: 'JP Morgan' });

    const response = await request(app).get('/api/trades?counterparty=morgan');

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(1);
    expect(response.body.data[0].counterparty).toBe('JP Morgan');
  });

  it('accepts every sort column the grid will offer', async () => {
    const { app } = build_app();
    await create_trade(app);

    for (const column of trade_sort_columns) {
      const response = await request(app).get(`/api/trades?sort_by=${column}`);

      expect(response.status).toBe(200);
    }
  });

  it('rejects a sort column that does not exist', async () => {
    const { app } = build_app();

    const response = await request(app).get('/api/trades?sort_by=secret');

    expect(response.status).toBe(422);
  });
});
