import { beforeEach, describe, expect, it } from 'vitest';
import {
  trade_query_schema,
  trade_sort_columns,
  type CreateTrade,
  type Trade,
  type TradeList,
} from '@blotter/shared';
import type { TradeBroadcaster } from '../interfaces/trade_broadcaster.js';
import { create_in_memory_trade_repository } from '../repositories/in_memory_trade_repository.js';
import { AppError } from '../lib/errors/app_error.js';
import { create_trade_service, type TradeActor, type TradeService } from './trade_service.js';

/** A broadcaster that remembers what it was asked to announce. */
interface RecordingBroadcaster extends TradeBroadcaster {
  /** Every announcement, in order, as `event_name` and the trade that went with it. */
  readonly sent: { event: string; trade: Trade }[];
}

/**
 * Builds a broadcaster that records instead of emitting.
 *
 * @returns A broadcaster whose `sent` array can be asserted on.
 */
function create_recording_broadcaster(): RecordingBroadcaster {
  const sent: { event: string; trade: Trade }[] = [];

  return {
    sent,
    trade_created: (trade) => sent.push({ event: 'trade.created', trade }),
    trade_amended: (trade) => sent.push({ event: 'trade.amended', trade }),
    trade_cancelled: (trade) => sent.push({ event: 'trade.cancelled', trade }),
  };
}

/**
 * A valid create payload, with any field overridable per test.
 *
 * @param overrides - Fields to replace.
 * @returns A payload the create endpoint would accept.
 */
function a_create_payload(overrides: Partial<CreateTrade> = {}): CreateTrade {
  return {
    symbol: 'AAPL',
    side: 'BUY',
    quantity: 5000,
    price: 227.45,
    book: 'EQUITIES_US',
    counterparty: 'Goldman Sachs',
    tradeTimestamp: '2026-08-18T09:15:23.000Z',
    ...overrides,
  };
}

/**
 * The actor most tests run as: an ordinary trader booking under their own desk code.
 */
const trader_actor: TradeActor = { trader_code: 'JSMITH', role: 'TRADER', source: 'API' };

/**
 * Builds an actor for a specific desk code and role.
 *
 * @param trader_code - The desk code.
 * @param role - The role held.
 * @param source - Which path the change arrived through.
 * @returns The actor.
 */
function actor_for(
  trader_code: string,
  role: TradeActor['role'] = 'TRADER',
  source: TradeActor['source'] = 'API',
): TradeActor {
  return { trader_code, role, source };
}

describe('trade service', () => {
  let broadcaster: RecordingBroadcaster;
  let service: TradeService;

  beforeEach(() => {
    broadcaster = create_recording_broadcaster();
    service = create_trade_service(create_in_memory_trade_repository(), broadcaster);
  });

  describe('create', () => {
    it('stores the trade as ACTIVE at version 1', async () => {
      const trade = await service.create(a_create_payload(), trader_actor);

      expect(trade.status).toBe('ACTIVE');
      expect(trade.version).toBe(1);
      expect(trade.tradeId).toMatch(/^TRD-\d{6,}$/);
    });

    it('resolves the currency from the instrument rather than the ticket', async () => {
      const us = await service.create(a_create_payload({ symbol: 'AAPL' }), trader_actor);
      const london = await service.create(a_create_payload({ symbol: 'VOD.L', price: 78 }), trader_actor);

      expect(us.currency).toBe('USD');
      expect(london.currency).toBe('GBX');
    });

    it('announces the new trade', async () => {
      const trade = await service.create(a_create_payload(), trader_actor);

      expect(broadcaster.sent).toEqual([{ event: 'trade.created', trade }]);
    });

    it('refuses a ticket over the desk notional limit', async () => {
      await expect(
        service.create(a_create_payload({ quantity: 1_000_000, price: 100 }), trader_actor),
      ).rejects.toMatchObject({ status: 422 });
    });

    it('applies the limit in the instrument currency, not one global figure', async () => {
      // 1,000,000 x 2814 GBX is 2.8bn GBX, inside the GBX ceiling and far outside the USD one.
      const london = await service.create(
        a_create_payload({ symbol: 'SHEL.L', quantity: 1_000_000, price: 2814 }),
        trader_actor,
      );

      expect(london.currency).toBe('GBX');
    });

    it('announces nothing when the limit refuses the ticket', async () => {
      await expect(
        service.create(a_create_payload({ quantity: 1_000_000, price: 100 }), trader_actor),
      ).rejects.toThrow();

      expect(broadcaster.sent).toEqual([]);
    });
  });

  describe('get', () => {
    it('returns the trade', async () => {
      const created = await service.create(a_create_payload(), trader_actor);

      await expect(service.get(created.tradeId)).resolves.toEqual(created);
    });

    it('reports 404 for a trade that does not exist', async () => {
      await expect(service.get('TRD-999999')).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('list', () => {
    it('returns the window alongside the unpaged total', async () => {
      await service.create(a_create_payload({ symbol: 'AAPL' }), trader_actor);
      await service.create(a_create_payload({ symbol: 'MSFT' }), trader_actor);
      await service.create(a_create_payload({ symbol: 'TSLA' }), trader_actor);

      const page = await service.list(trade_query_schema.parse({ limit: '2' }));

      expect(page.data).toHaveLength(2);
      expect(page.total).toBe(3);
      expect(page.limit).toBe(2);
      expect(page.next_cursor).not.toBeNull();
    });

    it('filters case-insensitively on a substring', async () => {
      await service.create(a_create_payload({ book: 'EQUITIES_UK' }), trader_actor);
      await service.create(a_create_payload({ book: 'TECH_GROWTH' }), trader_actor);

      const page = await service.list(trade_query_schema.parse({ book: 'equities' }));

      expect(page.total).toBe(1);
      expect(page.data[0]?.book).toBe('EQUITIES_UK');
    });

    it('filters on counterparty', async () => {
      await service.create(a_create_payload({ counterparty: 'Goldman Sachs' }), trader_actor);
      await service.create(a_create_payload({ counterparty: 'JP Morgan' }), trader_actor);

      const page = await service.list(trade_query_schema.parse({ counterparty: 'morgan' }));

      expect(page.total).toBe(1);
    });

    it('filters on a trade-date range', async () => {
      await service.create(a_create_payload({ tradeTimestamp: '2026-08-18T09:00:00.000Z' }), trader_actor);
      await service.create(a_create_payload({ tradeTimestamp: '2026-08-20T09:00:00.000Z' }), trader_actor);

      const page = await service.list(
        trade_query_schema.parse({
          date_from: '2026-08-18T00:00:00.000Z',
          date_to: '2026-08-18T23:59:59.000Z',
        }),
      );

      expect(page.total).toBe(1);
      expect(page.data[0]?.tradeTimestamp).toBe('2026-08-18T09:00:00.000Z');
    });

    it('sorts on the requested column and direction', async () => {
      await service.create(a_create_payload({ quantity: 300 }), trader_actor);
      await service.create(a_create_payload({ quantity: 100 }), trader_actor);
      await service.create(a_create_payload({ quantity: 200 }), trader_actor);

      const page = await service.list(
        trade_query_schema.parse({ sort_by: 'quantity', sort_dir: 'asc' }),
      );

      expect(page.data.map((trade) => trade.quantity)).toEqual([100, 200, 300]);
    });

    it('sorts on every column the grid can display', async () => {
      await service.create(a_create_payload({ symbol: 'MSFT' }), trader_actor);
      await service.create(a_create_payload({ symbol: 'AAPL' }), trader_actor);

      for (const column of trade_sort_columns) {
        const page = await service.list(trade_query_schema.parse({ sort_by: column }));

        expect(page.data).toHaveLength(2);
      }
    });
  });

  describe('cursor paging', () => {
    it('walks the whole set without repeating or skipping a row', async () => {
      for (let index = 0; index < 7; index += 1) {
        await service.create(a_create_payload({ quantity: (index + 1) * 100 }), trader_actor);
      }

      const seen: string[] = [];
      let cursor: string | null = null;

      do {
        const page: TradeList = await service.list(
          trade_query_schema.parse({ limit: '3', ...(cursor === null ? {} : { cursor }) }),
        );
        seen.push(...page.data.map((trade) => trade.tradeId));
        cursor = page.next_cursor;
      } while (cursor !== null);

      expect(seen).toHaveLength(7);
      expect(new Set(seen).size).toBe(7);
    });

    it('does not re-serve a row when trades are inserted between pages', async () => {
      for (let index = 0; index < 6; index += 1) {
        await service.create(a_create_payload({ quantity: (index + 1) * 100 }), trader_actor);
      }

      const first = await service.list(trade_query_schema.parse({ limit: '3' }));

      // The blotter inserts all day. This is exactly what breaks offset paging.
      await service.create(a_create_payload({ quantity: 9999 }), trader_actor);
      await service.create(a_create_payload({ quantity: 8888 }), trader_actor);

      const second = await service.list(
        trade_query_schema.parse({ limit: '3', cursor: first.next_cursor ?? '' }),
      );

      const first_ids = first.data.map((trade) => trade.tradeId);
      const second_ids = second.data.map((trade) => trade.tradeId);

      expect(second_ids.filter((id) => first_ids.includes(id))).toEqual([]);
    });

    it('treats an unreadable cursor as the first page rather than an error', async () => {
      await service.create(a_create_payload(), trader_actor);

      const page = await service.list(trade_query_schema.parse({ cursor: 'not-a-cursor' }));

      expect(page.data).toHaveLength(1);
    });
  });

  describe('amend', () => {
    it('applies the change, bumps the version and announces it', async () => {
      const created = await service.create(a_create_payload(), trader_actor);

      const amended = await service.amend(
        created.tradeId,
        { version: created.version, quantity: 7500 },
        trader_actor,
      );

      expect(amended.quantity).toBe(7500);
      expect(amended.version).toBe(2);
      expect(broadcaster.sent.at(-1)).toEqual({ event: 'trade.amended', trade: amended });
    });

    it('rejects an amendment that changes nothing', async () => {
      const created = await service.create(a_create_payload(), trader_actor);

      await expect(
        service.amend(created.tradeId, { version: created.version }, trader_actor),
      ).rejects.toMatchObject({ status: 422 });
    });

    it('refuses an amendment that would breach the notional limit', async () => {
      const created = await service.create(a_create_payload(), trader_actor);

      await expect(
        service.amend(created.tradeId, { version: 1, quantity: 1_000_000, price: 100 }, trader_actor),
      ).rejects.toMatchObject({ status: 422 });
    });

    it('reports 404 for a trade that does not exist', async () => {
      await expect(
        service.amend('TRD-999999', { version: 1, quantity: 100 }, trader_actor),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('reports 409 when the client version is stale', async () => {
      const created = await service.create(a_create_payload(), trader_actor);
      await service.amend(created.tradeId, { version: 1, quantity: 200 }, trader_actor);

      const conflict = await service
        .amend(created.tradeId, { version: 1, quantity: 300 }, trader_actor)
        .catch((error: unknown) => error);

      expect(conflict).toBeInstanceOf(AppError);
      if (conflict instanceof AppError) {
        expect(conflict.status).toBe(409);
        expect(conflict.message).toContain('version 2');
      }
    });

    it('reports 409 when the trade is already cancelled', async () => {
      const created = await service.create(a_create_payload(), trader_actor);
      await service.cancel(created.tradeId, undefined, trader_actor);

      const conflict = await service
        .amend(created.tradeId, { version: 2, quantity: 300 }, trader_actor)
        .catch((error: unknown) => error);

      expect(conflict).toBeInstanceOf(AppError);
      if (conflict instanceof AppError) {
        expect(conflict.status).toBe(409);
        expect(conflict.message).toContain('cancelled');
      }
    });

    it('does not announce anything when the amendment fails', async () => {
      const created = await service.create(a_create_payload(), trader_actor);
      broadcaster.sent.length = 0;

      await expect(
        service.amend(created.tradeId, { version: 99, quantity: 300 }, trader_actor),
      ).rejects.toThrow();

      expect(broadcaster.sent).toEqual([]);
    });
  });

  describe('cancel', () => {
    it('moves the trade to CANCELLED and announces it', async () => {
      const created = await service.create(a_create_payload(), trader_actor);

      const cancelled = await service.cancel(created.tradeId, undefined, trader_actor);

      expect(cancelled.status).toBe('CANCELLED');
      expect(cancelled.version).toBe(2);
      expect(broadcaster.sent.at(-1)).toEqual({ event: 'trade.cancelled', trade: cancelled });
    });

    it('honours the version guard when one is supplied', async () => {
      const created = await service.create(a_create_payload(), trader_actor);

      await expect(service.cancel(created.tradeId, 99, trader_actor)).rejects.toMatchObject({
        status: 409,
      });
    });

    it('reports 409 when the trade is already cancelled', async () => {
      const created = await service.create(a_create_payload(), trader_actor);
      await service.cancel(created.tradeId, undefined, trader_actor);

      await expect(service.cancel(created.tradeId, undefined, trader_actor)).rejects.toMatchObject({
        status: 409,
      });
    });

    it('reports 404 for a trade that does not exist', async () => {
      await expect(service.cancel('TRD-999999', undefined, trader_actor)).rejects.toMatchObject({
        status: 404,
      });
    });
  });

  describe('history', () => {
    it('is empty for a trade that has never changed', async () => {
      const created = await service.create(a_create_payload(), trader_actor);

      await expect(service.list_events(created.tradeId)).resolves.toEqual([]);
    });

    it('reports 404 rather than an empty list for a trade that does not exist', async () => {
      await expect(service.list_events('TRD-999999')).rejects.toMatchObject({ status: 404 });
    });

    it('records an amendment with both sides of what moved', async () => {
      const created = await service.create(a_create_payload({ quantity: 5000 }), trader_actor);
      await service.amend(created.tradeId, { version: 1, quantity: 7500 }, trader_actor);

      const [event] = await service.list_events(created.tradeId);

      expect(event?.action).toBe('AMENDED');
      expect(event?.version).toBe(2);
      expect(event?.changes).toEqual({ quantity: { from: 5000, to: 7500 } });
    });

    it('records a cancellation, so a cancelled trade has a trace of who cancelled it', async () => {
      const created = await service.create(a_create_payload(), actor_for('MJONES'));
      await service.cancel(created.tradeId, undefined, actor_for('MJONES'));

      const [event] = await service.list_events(created.tradeId);

      expect(event?.action).toBe('CANCELLED');
      expect(event?.actor).toBe('MJONES');
      expect(event?.changes).toEqual({ status: { from: 'ACTIVE', to: 'CANCELLED' } });
    });

    it('records where the change came in from', async () => {
      const created = await service.create(a_create_payload(), trader_actor);
      await service.amend(created.tradeId, { version: 1, quantity: 100 }, trader_actor);
      await service.cancel(created.tradeId, undefined, actor_for('JSMITH', 'TRADER', 'LIVE_FEED'));

      const history = await service.list_events(created.tradeId);

      expect(history.map((event) => event.source)).toEqual(['API', 'LIVE_FEED']);
    });

    it('accumulates one row per change, oldest first', async () => {
      const created = await service.create(a_create_payload(), trader_actor);
      await service.amend(created.tradeId, { version: 1, quantity: 100 }, trader_actor);
      await service.amend(created.tradeId, { version: 2, quantity: 200 }, trader_actor);
      await service.cancel(created.tradeId, undefined, trader_actor);

      const history = await service.list_events(created.tradeId);

      expect(history.map((event) => event.version)).toEqual([2, 3, 4]);
      expect(history.map((event) => event.action)).toEqual(['AMENDED', 'AMENDED', 'CANCELLED']);
    });

    it('writes nothing when the change is rejected', async () => {
      const created = await service.create(a_create_payload(), trader_actor);

      await expect(
        service.amend(created.tradeId, { version: 99, quantity: 300 }, trader_actor),
      ).rejects.toThrow();

      await expect(service.list_events(created.tradeId)).resolves.toEqual([]);
    });
  });
});
