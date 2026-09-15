import { beforeEach, describe, expect, it } from 'vitest';
import {
  apply_trade,
  build_positions,
  empty_position,
  trade_query_schema,
  trade_sort_columns,
  type CreateTrade,
  type MarkSet,
  type Position,
  type Trade,
  type TradeEvent,
  type TradeList,
} from '@blotter/shared';
import type { TradeBroadcaster } from '../../interfaces/trade_broadcaster.js';
import { create_in_memory_trade_repository } from '../../repositories/in_memory_trade_repository/index.js';
import { AppError } from '../../lib/errors/app_error.js';
import { create_trade_service, type TradeActor, type TradeService } from './index.js';

/** One announcement, as the service made it, keyed by what it carried. */
type Announcement =
  | { event: 'trade.created' | 'trade.amended' | 'trade.cancelled'; trade: Trade }
  | { event: 'trade_event.recorded'; audit: TradeEvent }
  | { event: 'position.updated'; position: Position }
  | { event: 'mark.updated'; marks: MarkSet };

/** A broadcaster that remembers what it was asked to announce. */
interface RecordingBroadcaster extends TradeBroadcaster {
  /** Every announcement, in the order the service made them. */
  readonly sent: Announcement[];
}

/**
 * Builds a broadcaster that records instead of emitting.
 *
 * @returns A broadcaster whose `sent` array can be asserted on.
 */
function create_recording_broadcaster(): RecordingBroadcaster {
  const sent: Announcement[] = [];

  return {
    sent,
    trade_created: (trade) => sent.push({ event: 'trade.created', trade }),
    trade_amended: (trade) => sent.push({ event: 'trade.amended', trade }),
    trade_cancelled: (trade) => sent.push({ event: 'trade.cancelled', trade }),
    trade_event_recorded: (audit) => sent.push({ event: 'trade_event.recorded', audit }),
    position_updated: (position) => sent.push({ event: 'position.updated', position }),
    marks_updated: (marks) => sent.push({ event: 'mark.updated', marks }),
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

    it('announces the new trade, then the position it opens, and no audit event', async () => {
      const trade = await service.create(a_create_payload(), trader_actor);

      expect(broadcaster.sent).toEqual([
        { event: 'trade.created', trade },
        { event: 'position.updated', position: apply_trade(empty_position('AAPL', 'USD'), trade) },
      ]);
    });

    it('refuses a ticket over the desk limit, saying what a US trade is worth in dollars', async () => {
      await expect(
        service.create(a_create_payload({ quantity: 250_000, price: 250 }), trader_actor),
      ).rejects.toMatchObject({
        status: 422,
        message: 'This trade is worth $62,500,000, over the $50,000,000 limit for US names.',
        details: [{ field: 'quantity', message: 'This trade is over the desk limit. Lower the quantity or price.' }],
      });
    });

    it('shows a London trade and its limit in pounds rather than pence', async () => {
      await expect(
        service.create(a_create_payload({ symbol: 'SHEL.L', quantity: 1_000_000, price: 4100 }), trader_actor),
      ).rejects.toMatchObject({
        status: 422,
        message: 'This trade is worth £41,000,000, over the £40,000,000 limit for London names.',
      });
    });

    it('rounds the worth up to the whole unit, so it never reads as equal to the limit', async () => {
      // 1,000,003 x 51.37 is $51,370,154.11. 7 x 7,142,857.143 is a tenth of a cent over the limit,
      // which rounding to the cent alone would show as equal to it.
      await expect(
        service.create(a_create_payload({ quantity: 1_000_003, price: 51.37 }), trader_actor),
      ).rejects.toMatchObject({
        message: 'This trade is worth $51,370,155, over the $50,000,000 limit for US names.',
      });
      await expect(
        service.create(a_create_payload({ quantity: 7, price: 7_142_857.143 }), trader_actor),
      ).rejects.toMatchObject({
        message: 'This trade is worth $50,000,001, over the $50,000,000 limit for US names.',
      });
    });

    it('keeps floating-point residue from adding a unit to a whole worth', async () => {
      // 5,242,900 x 10.05 is exactly $52,691,145, which binary arithmetic makes 52,691,145.00000001.
      await expect(
        service.create(a_create_payload({ quantity: 5_242_900, price: 10.05 }), trader_actor),
      ).rejects.toMatchObject({
        message: 'This trade is worth $52,691,145, over the $50,000,000 limit for US names.',
      });
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
      expect(broadcaster.sent.at(-3)).toEqual({ event: 'trade.amended', trade: amended });
    });

    it('announces the trade, then its audit row, then the position, in that order', async () => {
      const created = await service.create(a_create_payload(), trader_actor);
      broadcaster.sent.length = 0;

      const amended = await service.amend(
        created.tradeId,
        { version: created.version, quantity: 7500 },
        trader_actor,
      );
      const [audit] = await service.list_events(created.tradeId);

      expect(broadcaster.sent).toEqual([
        { event: 'trade.amended', trade: amended },
        { event: 'trade_event.recorded', audit },
        { event: 'position.updated', position: apply_trade(empty_position('AAPL', 'USD'), amended) },
      ]);
    });

    it('rejects an amendment that changes nothing', async () => {
      const created = await service.create(a_create_payload(), trader_actor);

      await expect(
        service.amend(created.tradeId, { version: created.version }, trader_actor),
      ).rejects.toMatchObject({ status: 422 });
    });

    it('still corrects the book, and records the move', async () => {
      const created = await service.create(a_create_payload({ book: 'EQUITIES_US' }), trader_actor);

      const amended = await service.amend(
        created.tradeId,
        { version: created.version, book: 'TECH_GROWTH' },
        trader_actor,
      );
      const [event] = await service.list_events(created.tradeId);

      expect(amended.book).toBe('TECH_GROWTH');
      expect(amended.counterparty).toBe('Goldman Sachs');
      expect(event?.changes).toEqual({ book: { from: 'EQUITIES_US', to: 'TECH_GROWTH' } });
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
      expect(broadcaster.sent.at(-3)).toEqual({ event: 'trade.cancelled', trade: cancelled });
    });

    it('announces the trade, then its audit row, then the now-flat position, in that order', async () => {
      const created = await service.create(a_create_payload(), trader_actor);
      broadcaster.sent.length = 0;

      const cancelled = await service.cancel(created.tradeId, undefined, trader_actor);
      const [audit] = await service.list_events(created.tradeId);

      expect(broadcaster.sent).toEqual([
        { event: 'trade.cancelled', trade: cancelled },
        { event: 'trade_event.recorded', audit },
        { event: 'position.updated', position: empty_position('AAPL', 'USD') },
      ]);
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

  describe('positions', () => {
    it('walks the active trades with the shared book, so the average and realised P&L are right', async () => {
      const opened = await service.create(
        a_create_payload({
          symbol: 'MSFT',
          quantity: 100,
          price: 100,
          tradeTimestamp: '2026-08-18T09:00:00.000Z',
        }),
        trader_actor,
      );
      const closed = await service.create(
        a_create_payload({
          symbol: 'MSFT',
          side: 'SELL',
          quantity: 40,
          price: 110,
          tradeTimestamp: '2026-08-18T10:00:00.000Z',
        }),
        trader_actor,
      );
      const other = await service.create(a_create_payload({ symbol: 'AAPL' }), trader_actor);
      const doomed = await service.create(a_create_payload({ symbol: 'AAPL', quantity: 1 }), trader_actor);
      const cancelled = await service.cancel(doomed.tradeId, undefined, trader_actor);

      const positions = await service.list_positions();

      expect(positions).toEqual(build_positions([opened, closed, other, cancelled]));
      expect(positions.map((position) => position.symbol)).toEqual(['AAPL', 'MSFT']);
      expect(positions[1]).toMatchObject({ netQuantity: 60, averagePrice: 100, realisedPnl: 400 });
    });

    it('reads one symbol without the others', async () => {
      const microsoft = await service.create(a_create_payload({ symbol: 'MSFT' }), trader_actor);
      await service.create(a_create_payload({ symbol: 'AAPL' }), trader_actor);

      await expect(service.position_for('MSFT')).resolves.toEqual(
        apply_trade(empty_position('MSFT', 'USD'), microsoft),
      );
    });

    it('answers a flat position, in the instrument currency, for a symbol with no trades', async () => {
      await service.create(a_create_payload({ symbol: 'AAPL' }), trader_actor);

      await expect(service.position_for('VOD.L')).resolves.toEqual(empty_position('VOD.L', 'GBX'));
    });
  });
});
