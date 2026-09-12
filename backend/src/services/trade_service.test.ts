import { beforeEach, describe, expect, it } from 'vitest';
import {
  trade_query_schema,
  trade_sort_columns,
  type CreateTrade,
  type Trade,
} from '@blotter/shared';
import type { TradeBroadcaster } from '../interfaces/trade_broadcaster.js';
import { create_in_memory_trade_repository } from '../repositories/in_memory_trade_repository.js';
import { AppError } from '../lib/errors/app_error.js';
import { create_trade_service, type TradeService } from './trade_service.js';

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
 * @returns A payload that passes `create_trade_schema`.
 */
function a_create_payload(overrides: Partial<CreateTrade> = {}): CreateTrade {
  return {
    symbol: 'AAPL',
    side: 'BUY',
    quantity: 5000,
    price: 227.45,
    trader: 'JSMITH',
    book: 'EQUITIES_US',
    counterparty: 'Goldman Sachs',
    tradeTimestamp: '2026-08-18T09:15:23.000Z',
    ...overrides,
  };
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
      const trade = await service.create(a_create_payload());

      expect(trade.status).toBe('ACTIVE');
      expect(trade.version).toBe(1);
      expect(trade.tradeId).toMatch(/^TRD-\d{6,}$/);
    });

    it('announces the new trade', async () => {
      const trade = await service.create(a_create_payload());

      expect(broadcaster.sent).toEqual([{ event: 'trade.created', trade }]);
    });
  });

  describe('get', () => {
    it('returns the trade', async () => {
      const created = await service.create(a_create_payload());

      await expect(service.get(created.tradeId)).resolves.toEqual(created);
    });

    it('reports 404 for a trade that does not exist', async () => {
      await expect(service.get('TRD-999999')).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('list', () => {
    it('returns the window alongside the unpaged total', async () => {
      await service.create(a_create_payload({ symbol: 'AAPL' }));
      await service.create(a_create_payload({ symbol: 'MSFT' }));
      await service.create(a_create_payload({ symbol: 'TSLA' }));

      const page = await service.list(trade_query_schema.parse({ limit: '2', offset: '0' }));

      expect(page.data).toHaveLength(2);
      expect(page.total).toBe(3);
      expect(page.limit).toBe(2);
      expect(page.offset).toBe(0);
    });

    it('filters case-insensitively on a substring', async () => {
      await service.create(a_create_payload({ book: 'EQUITIES_UK' }));
      await service.create(a_create_payload({ book: 'TECH_GROWTH' }));

      const page = await service.list(trade_query_schema.parse({ book: 'equities' }));

      expect(page.total).toBe(1);
      expect(page.data[0]?.book).toBe('EQUITIES_UK');
    });

    it('sorts on the requested column and direction', async () => {
      await service.create(a_create_payload({ quantity: 300 }));
      await service.create(a_create_payload({ quantity: 100 }));
      await service.create(a_create_payload({ quantity: 200 }));

      const page = await service.list(
        trade_query_schema.parse({ sort_by: 'quantity', sort_dir: 'asc' }),
      );

      expect(page.data.map((trade) => trade.quantity)).toEqual([100, 200, 300]);
    });
  });

  describe('amend', () => {
    it('applies the change, bumps the version and announces it', async () => {
      const created = await service.create(a_create_payload());

      const amended = await service.amend(created.tradeId, {
        version: created.version,
        quantity: 7500,
      });

      expect(amended.quantity).toBe(7500);
      expect(amended.version).toBe(2);
      expect(broadcaster.sent.at(-1)).toEqual({ event: 'trade.amended', trade: amended });
    });

    it('rejects an amendment that changes nothing', async () => {
      const created = await service.create(a_create_payload());

      await expect(
        service.amend(created.tradeId, { version: created.version }),
      ).rejects.toMatchObject({ status: 422 });
    });

    it('reports 404 for a trade that does not exist', async () => {
      await expect(
        service.amend('TRD-999999', { version: 1, quantity: 100 }),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('reports 409 when the client version is stale', async () => {
      const created = await service.create(a_create_payload());
      await service.amend(created.tradeId, { version: 1, quantity: 200 });

      const conflict = await service
        .amend(created.tradeId, { version: 1, quantity: 300 })
        .catch((error: unknown) => error);

      expect(conflict).toBeInstanceOf(AppError);
      if (conflict instanceof AppError) {
        expect(conflict.status).toBe(409);
        expect(conflict.message).toContain('version 2');
      }
    });

    it('reports 409 when the trade is already cancelled', async () => {
      const created = await service.create(a_create_payload());
      await service.cancel(created.tradeId);

      const conflict = await service
        .amend(created.tradeId, { version: 2, quantity: 300 })
        .catch((error: unknown) => error);

      expect(conflict).toBeInstanceOf(AppError);
      if (conflict instanceof AppError) {
        expect(conflict.status).toBe(409);
        expect(conflict.message).toContain('cancelled');
      }
    });

    it('does not announce anything when the amendment fails', async () => {
      const created = await service.create(a_create_payload());
      broadcaster.sent.length = 0;

      await expect(
        service.amend(created.tradeId, { version: 99, quantity: 300 }),
      ).rejects.toThrow();

      expect(broadcaster.sent).toEqual([]);
    });
  });

  describe('cancel', () => {
    it('moves the trade to CANCELLED and announces it', async () => {
      const created = await service.create(a_create_payload());

      const cancelled = await service.cancel(created.tradeId);

      expect(cancelled.status).toBe('CANCELLED');
      expect(cancelled.version).toBe(2);
      expect(broadcaster.sent.at(-1)).toEqual({ event: 'trade.cancelled', trade: cancelled });
    });

    it('honours the version guard when one is supplied', async () => {
      const created = await service.create(a_create_payload());

      await expect(service.cancel(created.tradeId, 99)).rejects.toMatchObject({ status: 409 });
    });

    it('reports 409 when the trade is already cancelled', async () => {
      const created = await service.create(a_create_payload());
      await service.cancel(created.tradeId);

      await expect(service.cancel(created.tradeId)).rejects.toMatchObject({ status: 409 });
    });

    it('reports 404 for a trade that does not exist', async () => {
      await expect(service.cancel('TRD-999999')).rejects.toMatchObject({ status: 404 });
    });
  });
});

describe('trade service, audit trail and widened query', () => {
  let broadcaster: RecordingBroadcaster;
  let service: TradeService;

  beforeEach(() => {
    broadcaster = create_recording_broadcaster();
    service = create_trade_service(create_in_memory_trade_repository(), broadcaster);
  });

  describe('amendment history', () => {
    it('is empty for a trade that has never been amended', async () => {
      const created = await service.create(a_create_payload());

      await expect(service.list_amendments(created.tradeId)).resolves.toEqual([]);
    });

    it('reports 404 rather than an empty list for a trade that does not exist', async () => {
      await expect(service.list_amendments('TRD-999999')).rejects.toMatchObject({ status: 404 });
    });

    it('records what moved, with both sides', async () => {
      const created = await service.create(a_create_payload({ quantity: 5000 }));
      await service.amend(created.tradeId, { version: 1, quantity: 7500 });

      const [amendment] = await service.list_amendments(created.tradeId);

      expect(amendment?.version).toBe(2);
      expect(amendment?.changes).toEqual({ quantity: { from: 5000, to: 7500 } });
    });

    it('attributes the amendment to the payload trader when one is sent', async () => {
      const created = await service.create(a_create_payload({ trader: 'JSMITH' }));
      await service.amend(created.tradeId, { version: 1, trader: 'ABROWN' });

      const [amendment] = await service.list_amendments(created.tradeId);

      expect(amendment?.amendedBy).toBe('ABROWN');
    });

    it("falls back to the trade's own trader when the amendment does not touch it", async () => {
      const created = await service.create(a_create_payload({ trader: 'JSMITH' }));
      await service.amend(created.tradeId, { version: 1, quantity: 7500 });

      const [amendment] = await service.list_amendments(created.tradeId);

      expect(amendment?.amendedBy).toBe('JSMITH');
    });

    it('accumulates one row per amendment, oldest first', async () => {
      const created = await service.create(a_create_payload());
      await service.amend(created.tradeId, { version: 1, quantity: 100 });
      await service.amend(created.tradeId, { version: 2, quantity: 200 });
      await service.amend(created.tradeId, { version: 3, price: 999.5 });

      const history = await service.list_amendments(created.tradeId);

      expect(history.map((entry) => entry.version)).toEqual([2, 3, 4]);
      expect(history.at(-1)?.changes).toHaveProperty('price');
    });

    it('writes no audit row when the amendment is rejected', async () => {
      const created = await service.create(a_create_payload());

      await expect(
        service.amend(created.tradeId, { version: 99, quantity: 300 }),
      ).rejects.toThrow();

      await expect(service.list_amendments(created.tradeId)).resolves.toEqual([]);
    });
  });

  describe('widened query surface', () => {
    it('filters on counterparty', async () => {
      await service.create(a_create_payload({ counterparty: 'Goldman Sachs' }));
      await service.create(a_create_payload({ counterparty: 'JP Morgan' }));

      const page = await service.list(trade_query_schema.parse({ counterparty: 'morgan' }));

      expect(page.total).toBe(1);
      expect(page.data[0]?.counterparty).toBe('JP Morgan');
    });

    it('sorts on counterparty', async () => {
      await service.create(a_create_payload({ counterparty: 'Nomura' }));
      await service.create(a_create_payload({ counterparty: 'Barclays' }));
      await service.create(a_create_payload({ counterparty: 'JP Morgan' }));

      const page = await service.list(
        trade_query_schema.parse({ sort_by: 'counterparty', sort_dir: 'asc' }),
      );

      expect(page.data.map((trade) => trade.counterparty)).toEqual([
        'Barclays',
        'JP Morgan',
        'Nomura',
      ]);
    });

    it('sorts on every column the grid can display', async () => {
      await service.create(a_create_payload({ symbol: 'MSFT', book: 'TECH_GROWTH' }));
      await service.create(a_create_payload({ symbol: 'AAPL', book: 'EQUITIES_UK' }));

      for (const column of trade_sort_columns) {
        const page = await service.list(trade_query_schema.parse({ sort_by: column }));

        expect(page.data).toHaveLength(2);
      }
    });

    it('rejects a sort column that is not a real one', () => {
      expect(() => trade_query_schema.parse({ sort_by: 'nonsense' })).toThrow();
    });
  });
});
