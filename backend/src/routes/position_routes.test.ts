import { describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { z } from 'zod';
import {
  position_schema,
  trade_schema,
  type Position,
  type Trade,
  type TradeSide,
} from '@blotter/shared';
import { api_prefix } from '../app.js';
import { bearer, build_test_app, token_for } from '../lib/testing/test_app.js';

/** Where the position resource lives. */
const positions_path = `${api_prefix}/positions`;

/** Where trades are booked, so a test has something to aggregate. */
const trades_path = `${api_prefix}/trades`;

/** The desk code every trade here books under. */
const own_desk = 'JSMITH';

/** The response shape, as an array of the shared contract. */
const positions_schema = z.array(position_schema);

/** What a booking here varies. Everything else is fixed, including a price of 100. */
interface Booking {
  symbol: string;
  side: TradeSide;
  quantity: number;
}

/**
 * Books one trade through the API.
 *
 * @param app - The app under test.
 * @param token - The bearer token to book under.
 * @param booking - The instrument, side and size.
 * @returns The created trade.
 */
async function book(app: Express, token: string, booking: Booking): Promise<Trade> {
  const response = await request(app)
    .post(trades_path)
    .set('Authorization', bearer(token))
    .send({
      ...booking,
      price: 100,
      book: 'EQUITIES_US',
      counterparty: 'Goldman Sachs',
      tradeTimestamp: '2026-08-18T09:15:23.000Z',
    });

  return trade_schema.parse(response.body);
}

/**
 * Reads the positions, parsed against the shared contract.
 *
 * @param app - The app under test.
 * @param token - The bearer token to read with.
 * @returns The rows, in the order the API returned them.
 */
async function read_positions(app: Express, token: string): Promise<Position[]> {
  const response = await request(app).get(positions_path).set('Authorization', bearer(token));

  expect(response.status).toBe(200);
  return positions_schema.parse(response.body);
}

describe(`GET ${api_prefix}/positions`, () => {
  it('refuses the request without a token', async () => {
    const { app } = build_test_app();

    const response = await request(app).get(positions_path);

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('unauthenticated');
  });

  it('lets a viewer read, and every row satisfies the shared contract', async () => {
    const { app } = build_test_app();
    await book(app, token_for(own_desk), { symbol: 'AAPL', side: 'BUY', quantity: 5000 });

    const response = await request(app)
      .get(positions_path)
      .set('Authorization', bearer(token_for('VIEWER', 'VIEWER')));

    expect(response.status).toBe(200);
    expect(() => positions_schema.parse(response.body)).not.toThrow();
    expect(response.body).toHaveLength(1);
  });

  it('nets the buys against the sells', async () => {
    const { app } = build_test_app();
    const token = token_for(own_desk);
    await book(app, token, { symbol: 'AAPL', side: 'BUY', quantity: 5000 });
    await book(app, token, { symbol: 'AAPL', side: 'SELL', quantity: 2000 });

    const [apple] = await read_positions(app, token);

    expect(apple).toMatchObject({
      symbol: 'AAPL',
      currency: 'USD',
      buyQuantity: 5000,
      sellQuantity: 2000,
      netQuantity: 3000,
      tradeCount: 2,
    });
    expect(apple?.grossNotional).toBe(700_000);
  });

  it('does not count a cancelled trade', async () => {
    const { app } = build_test_app();
    const token = token_for(own_desk);
    await book(app, token, { symbol: 'MSFT', side: 'BUY', quantity: 1000 });
    const doomed = await book(app, token, { symbol: 'MSFT', side: 'BUY', quantity: 9000 });
    await request(app)
      .post(`${trades_path}/${doomed.tradeId}/cancel`)
      .set('Authorization', bearer(token))
      .send({});

    const [microsoft] = await read_positions(app, token);

    expect(microsoft).toMatchObject({ buyQuantity: 1000, netQuantity: 1000, tradeCount: 1 });
  });

  it('sorts the rows by symbol', async () => {
    const { app } = build_test_app();
    const token = token_for(own_desk);
    for (const symbol of ['TSLA', 'AAPL', 'MSFT']) {
      await book(app, token, { symbol, side: 'BUY', quantity: 100 });
    }

    const positions = await read_positions(app, token);

    expect(positions.map((position) => position.symbol)).toEqual(['AAPL', 'MSFT', 'TSLA']);
  });
});
