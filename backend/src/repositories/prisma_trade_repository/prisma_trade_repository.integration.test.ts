import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  find_instrument,
  position_schema,
  trade_event_query_schema,
  trade_query_schema,
  trade_sort_columns,
  type TradeEvent,
} from '@blotter/shared';
import { PrismaClient } from '../../generated/prisma/client.js';
import type { NewTrade, TradeRepository } from '../../interfaces/trade_repository.js';
import type { TradeService } from '../../interfaces/trade_service.js';
import { create_trade_service } from '../../services/trade_service/index.js';
import { create_prisma_trade_repository } from './index.js';

/**
 * The database this tier runs against.
 *
 * Deliberately a separate variable from `DATABASE_URL`, so running the unit tests never points a
 * destructive suite at whatever database happens to be configured. Without it the tier skips, and
 * says so, rather than failing a developer who has no Postgres running.
 */
const test_database_url = process.env.TEST_DATABASE_URL;

/** Isolates this run's rows so a shared database can be used without cross-run interference. */
const test_book = `ITEST_${Date.now().toString()}`;

/** Context every write in this suite runs under. */
const api_context = { source: 'API' } as const;

/**
 * A valid stored trade inside this run's isolated book.
 *
 * @param overrides - Fields to replace.
 * @returns A row ready for the repository.
 */
function a_new_trade(overrides: Partial<NewTrade> = {}): NewTrade {
  return {
    symbol: 'AAPL',
    side: 'BUY',
    quantity: 5000,
    price: 227.45,
    currency: 'USD',
    trader: 'ITEST',
    book: test_book,
    counterparty: 'Goldman Sachs',
    tradeTimestamp: '2026-08-18T09:15:23.000Z',
    ...overrides,
  };
}

describe.skipIf(test_database_url === undefined)('prisma trade repository', () => {
  let prisma: PrismaClient;
  let repository: TradeRepository;
  let service: TradeService;

  beforeAll(() => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: test_database_url }),
    });
    repository = create_prisma_trade_repository(prisma);
    // The service is here only for `position_for`, which is where the walk over this
    // repository's rows lives. Nothing in this suite writes through it, so nothing is broadcast.
    service = create_trade_service(repository, {
      trade_created: () => undefined,
      trade_amended: () => undefined,
      trade_cancelled: () => undefined,
      trade_event_recorded: () => undefined,
      position_updated: () => undefined,
      marks_updated: () => undefined,
    });
  });

  afterAll(async () => {
    // The event table refuses deletes, including the cascade from deleting a trade, which is the
    // point of the trigger. A test harness is the one caller allowed to step around it, so the
    // trigger comes off for the length of the cleanup and goes straight back on.
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "trade_event" DISABLE TRIGGER "trade_event_append_only"',
    );
    await prisma.trade.deleteMany({ where: { book: test_book } });
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "trade_event" ENABLE TRIGGER "trade_event_append_only"',
    );
    await prisma.$disconnect();
  });

  describe('storing trades', () => {
    it('assigns a business identifier from the database sequence', async () => {
      const first = await repository.create(a_new_trade());
      const second = await repository.create(a_new_trade());

      expect(first.tradeId).toMatch(/^TRD-\d{6,}$/);
      expect(second.tradeId).not.toBe(first.tradeId);
    });

    it('round-trips a price through numeric(18,6) without losing precision', async () => {
      const created = await repository.create(a_new_trade({ price: 1234.567891 }));

      const read_back = await repository.find_by_trade_id(created.tradeId);

      expect(read_back?.price).toBe(1234.567891);
    });

    it('stores the currency, so a GBX name is distinguishable from a USD one', async () => {
      const london = await repository.create(
        a_new_trade({ symbol: 'VOD.L', currency: 'GBX', price: 78 }),
      );

      const read_back = await repository.find_by_trade_id(london.tradeId);

      expect(read_back?.currency).toBe('GBX');
      expect(read_back?.price).toBe(78);
    });

    it('stores a new trade as ACTIVE at version 1', async () => {
      const created = await repository.create(a_new_trade());

      expect(created.status).toBe('ACTIVE');
      expect(created.version).toBe(1);
    });

    it('answers null for a trade that does not exist', async () => {
      await expect(repository.find_by_trade_id('TRD-000001')).resolves.toBeNull();
    });
  });

  describe('querying', () => {
    it('filters, counts and pages independently', async () => {
      await repository.create(a_new_trade({ symbol: 'MSFT' }));
      await repository.create(a_new_trade({ symbol: 'MSFT' }));
      await repository.create(a_new_trade({ symbol: 'TSLA' }));

      const page = await repository.list(
        trade_query_schema.parse({ book: test_book, symbol: 'MSFT', limit: '1' }),
      );

      expect(page.trades).toHaveLength(1);
      expect(page.total).toBeGreaterThanOrEqual(2);
    });

    it('filters on counterparty case-insensitively', async () => {
      await repository.create(a_new_trade({ counterparty: 'Nomura' }));

      const page = await repository.list(
        trade_query_schema.parse({ book: test_book, counterparty: 'nomu' }),
      );

      expect(page.total).toBeGreaterThanOrEqual(1);
      expect(page.trades.every((trade) => trade.counterparty === 'Nomura')).toBe(true);
    });

    it('filters on a trade-date range', async () => {
      await repository.create(a_new_trade({ tradeTimestamp: '2026-07-01T09:00:00.000Z' }));

      const page = await repository.list(
        trade_query_schema.parse({
          book: test_book,
          date_from: '2026-07-01T00:00:00.000Z',
          date_to: '2026-07-01T23:59:59.000Z',
        }),
      );

      expect(page.total).toBe(1);
    });

    it('accepts every sort column the grid will offer', async () => {
      await repository.create(a_new_trade());

      for (const column of trade_sort_columns) {
        const page = await repository.list(
          trade_query_schema.parse({ book: test_book, sort_by: column, limit: '5' }),
        );

        expect(page.trades.length).toBeGreaterThan(0);
      }
    });

    it('pages with a cursor and does not re-serve a row when trades are inserted between pages', async () => {
      const book = `${test_book}_PAGING`;

      for (let index = 0; index < 6; index += 1) {
        await repository.create(a_new_trade({ book, quantity: (index + 1) * 100 }));
      }

      const first = await repository.list(trade_query_schema.parse({ book, limit: '3' }));

      await repository.create(a_new_trade({ book, quantity: 9999 }));
      await repository.create(a_new_trade({ book, quantity: 8888 }));

      const second = await repository.list(
        trade_query_schema.parse({ book, limit: '3', cursor: first.next_cursor ?? '' }),
      );

      const first_ids = first.trades.map((trade) => trade.tradeId);
      const second_ids = second.trades.map((trade) => trade.tradeId);

      expect(first_ids).toHaveLength(3);
      expect(second_ids.filter((id) => first_ids.includes(id))).toEqual([]);

      await prisma.$executeRawUnsafe(
        'ALTER TABLE "trade_event" DISABLE TRIGGER "trade_event_append_only"',
      );
      await prisma.trade.deleteMany({ where: { book } });
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "trade_event" ENABLE TRIGGER "trade_event_append_only"',
      );
    });
  });

  describe('reads the live feed relies on', () => {
    // A count cannot be isolated to this run's book, so this assumes nothing else writes to the
    // database while the tier runs, which is how `npm run test:integration` is meant to be used.
    it('counts only active trades', async () => {
      const before = await repository.count_active();
      await repository.create(a_new_trade());
      const dropped = await repository.create(a_new_trade());
      await repository.cancel(dropped.tradeId, dropped.version, api_context);

      expect(await repository.count_active()).toBe(before + 1);
      // A different read path as the oracle: every active row loaded, rather than counted.
      expect(await repository.count_active()).toBe((await repository.find_active_trades()).length);
    });
  });

  describe('concurrency', () => {
    it('amends only when the version still matches', async () => {
      const created = await repository.create(a_new_trade());

      const amended = await repository.amend(
        created.tradeId,
        created.version,
        { quantity: 7500 },
        api_context,
      );
      const stale = await repository.amend(
        created.tradeId,
        created.version,
        { quantity: 9000 },
        api_context,
      );

      expect(amended?.trade.quantity).toBe(7500);
      expect(amended?.trade.version).toBe(2);
      expect(stale).toBeNull();
    });

    it('refuses to amend a cancelled trade', async () => {
      const created = await repository.create(a_new_trade());
      const cancelled = await repository.cancel(created.tradeId, undefined, api_context);

      const amended = await repository.amend(
        created.tradeId,
        cancelled?.trade.version ?? 2,
        { quantity: 100 },
        api_context,
      );

      expect(cancelled?.trade.status).toBe('CANCELLED');
      expect(amended).toBeNull();
    });

    it('cancels once and only once', async () => {
      const created = await repository.create(a_new_trade());

      const first = await repository.cancel(created.tradeId, undefined, api_context);
      const second = await repository.cancel(created.tradeId, undefined, api_context);

      expect(first?.trade.status).toBe('CANCELLED');
      expect(second).toBeNull();
    });
  });

  describe('the event log', () => {
    it('hands back the audit row it wrote, the same row the history serves', async () => {
      const created = await repository.create(a_new_trade({ quantity: 5000 }));

      const amended = await repository.amend(created.tradeId, 1, { quantity: 7500 }, api_context);
      const cancelled = await repository.cancel(created.tradeId, 2, api_context);
      const history = await repository.find_events(created.tradeId);

      expect(amended?.event).toMatchObject({ tradeId: created.tradeId, action: 'AMENDED', version: 2 });
      expect(cancelled?.event).toMatchObject({ tradeId: created.tradeId, action: 'CANCELLED', version: 3 });
      expect(history).toEqual([amended?.event, cancelled?.event]);
    });

    it('writes one row per change, oldest first', async () => {
      const created = await repository.create(a_new_trade({ quantity: 5000 }));
      await repository.amend(created.tradeId, 1, { quantity: 7500 }, api_context);
      await repository.amend(created.tradeId, 2, { price: 999.5 }, api_context);
      await repository.cancel(created.tradeId, 3, api_context);

      const history = await repository.find_events(created.tradeId);

      expect(history.map((event) => event.version)).toEqual([2, 3, 4]);
      expect(history.map((event) => event.action)).toEqual(['AMENDED', 'AMENDED', 'CANCELLED']);
    });

    it('records both sides of every field that moved', async () => {
      const created = await repository.create(a_new_trade({ quantity: 5000 }));
      await repository.amend(created.tradeId, 1, { quantity: 7500 }, api_context);

      const [event] = await repository.find_events(created.tradeId);

      expect(event?.changes).toEqual({ quantity: { from: 5000, to: 7500 } });
    });

    it('records a cancellation as a status transition', async () => {
      const created = await repository.create(a_new_trade({ trader: 'MJONES' }));
      await repository.cancel(created.tradeId, undefined, api_context);

      const [event] = await repository.find_events(created.tradeId);

      expect(event?.action).toBe('CANCELLED');
      expect(event?.actor).toBe('MJONES');
      expect(event?.changes).toEqual({ status: { from: 'ACTIVE', to: 'CANCELLED' } });
    });

    it('records where the change came from', async () => {
      const created = await repository.create(a_new_trade());
      await repository.amend(created.tradeId, 1, { quantity: 400 }, { source: 'LIVE_FEED' });

      const [event] = await repository.find_events(created.tradeId);

      expect(event?.source).toBe('LIVE_FEED');
    });

    it('attributes to the supplied actor, and otherwise to the trade trader', async () => {
      const explicit = await repository.create(a_new_trade({ trader: 'JSMITH' }));
      await repository.amend(
        explicit.tradeId,
        1,
        { quantity: 400 },
        { source: 'API', actor: 'ABROWN' },
      );

      const implicit = await repository.create(a_new_trade({ trader: 'MJONES' }));
      await repository.amend(implicit.tradeId, 1, { quantity: 400 }, api_context);

      const [explicit_row] = await repository.find_events(explicit.tradeId);
      const [implicit_row] = await repository.find_events(implicit.tradeId);

      expect(explicit_row?.actor).toBe('ABROWN');
      expect(implicit_row?.actor).toBe('MJONES');
    });

    it('writes no row when the version check fails', async () => {
      const created = await repository.create(a_new_trade());

      const stale = await repository.amend(created.tradeId, 99, { quantity: 100 }, api_context);

      expect(stale).toBeNull();
      await expect(repository.find_events(created.tradeId)).resolves.toEqual([]);
    });

    it('is empty for a trade that exists and has never changed', async () => {
      const created = await repository.create(a_new_trade());

      await expect(repository.find_events(created.tradeId)).resolves.toEqual([]);
    });
  });

  describe('the global event feed', () => {
    it('lists newest first and walks the cursor one event at a time', async () => {
      const created = await repository.create(a_new_trade());
      await repository.amend(created.tradeId, 1, { quantity: 7500 }, api_context);
      await repository.cancel(created.tradeId, 2, api_context);

      const mine: TradeEvent[] = [];
      let cursor: string | undefined;

      // The shared database has a live feed writing to it, so other trades' events can sit above
      // these two. The walk continues until both have been seen, bounded so a broken cursor fails
      // the test instead of looping.
      for (let page = 0; page < 50 && mine.length < 2; page += 1) {
        const result = await repository.list_events(
          trade_event_query_schema.parse({
            limit: '1',
            ...(cursor === undefined ? {} : { cursor }),
          }),
        );

        expect(result.events).toHaveLength(1);
        expect(result.total).toBeGreaterThanOrEqual(2);
        mine.push(...result.events.filter((event) => event.tradeId === created.tradeId));

        if (result.next_cursor === null) {
          break;
        }
        cursor = result.next_cursor;
      }

      expect(mine.map((event) => event.action)).toEqual(['CANCELLED', 'AMENDED']);
      expect(mine.map((event) => event.version)).toEqual([3, 2]);
    });
  });

  describe('active trades, as the position walk reads them', () => {
    it('lists one symbol in execution order and leaves cancelled trades out', async () => {
      const symbol = 'GOOGL';
      const later = await repository.create(
        a_new_trade({ symbol, tradeTimestamp: '2026-08-18T11:00:00.000Z' }),
      );
      const earlier = await repository.create(
        a_new_trade({ symbol, tradeTimestamp: '2026-08-18T10:00:00.000Z' }),
      );
      const doomed = await repository.create(
        a_new_trade({ symbol, tradeTimestamp: '2026-08-18T10:30:00.000Z' }),
      );
      await repository.cancel(doomed.tradeId, undefined, api_context);

      // The shared database has a live feed writing to it, so rows outside this run's book can
      // sit between these. Only this run's rows are asserted on; every row is checked for symbol.
      const active = await repository.find_active_trades(symbol);
      const mine = active.filter((trade) => trade.book === test_book);

      expect(active.every((trade) => trade.symbol === symbol && trade.status === 'ACTIVE')).toBe(true);
      expect(mine.map((trade) => trade.tradeId)).toEqual([earlier.tradeId, later.tradeId]);
    });

    it('lists every symbol when none is given, oldest execution first', async () => {
      await repository.create(a_new_trade({ symbol: 'JPM' }));
      await repository.create(a_new_trade({ symbol: 'META' }));

      const active = await repository.find_active_trades();
      const symbols = new Set(active.map((trade) => trade.symbol));

      expect(symbols.has('JPM')).toBe(true);
      expect(symbols.has('META')).toBe(true);
      expect(active.every((trade) => trade.status === 'ACTIVE')).toBe(true);
      for (let index = 1; index < active.length; index += 1) {
        const previous = active[index - 1];
        const current = active[index];
        const by_time = Date.parse(current?.tradeTimestamp ?? '') - Date.parse(previous?.tradeTimestamp ?? '');
        expect(by_time >= 0).toBe(true);
        if (by_time === 0) {
          expect((previous?.id ?? '') < (current?.id ?? '')).toBe(true);
        }
      }
    });
  });

  describe('positions', () => {
    it('walks a BUY and a SELL into the symbol position, in the instrument currency', async () => {
      const symbol = 'NVDA';
      const before = await service.position_for(symbol);

      await repository.create(a_new_trade({ symbol, side: 'BUY', quantity: 5000, price: 178.9 }));
      await repository.create(a_new_trade({ symbol, side: 'SELL', quantity: 3000, price: 180.25 }));

      const after = await service.position_for(symbol);

      // The simulated feed writes to this database too, so the figures can only be bounded from
      // below and checked for the invariants the walk guarantees, whatever else it applied.
      expect(() => position_schema.parse(after)).not.toThrow();
      expect(after.buyQuantity - before.buyQuantity).toBeGreaterThanOrEqual(5000);
      expect(after.sellQuantity - before.sellQuantity).toBeGreaterThanOrEqual(3000);
      expect(after.tradeCount - before.tradeCount).toBeGreaterThanOrEqual(2);
      expect(after.grossNotional - before.grossNotional).toBeGreaterThanOrEqual(
        5000 * 178.9 + 3000 * 180.25 - 0.01,
      );
      expect(after.netQuantity).toBe(after.buyQuantity - after.sellQuantity);
      expect(after.averagePrice === 0).toBe(after.netQuantity === 0);
      expect(Number.isFinite(after.realisedPnl)).toBe(true);
      expect(after.currency).toBe(find_instrument(symbol)?.currency);
    });
  });

  describe('the event log is append-only, enforced by the database', () => {
    it('refuses an update, even from the application role', async () => {
      const created = await repository.create(a_new_trade());
      await repository.amend(created.tradeId, 1, { quantity: 7500 }, api_context);

      await expect(
        prisma.$executeRawUnsafe(
          "UPDATE \"trade_event\" SET \"actor\" = 'TAMPERED' WHERE \"actor\" = 'ITEST'",
        ),
      ).rejects.toThrow();
    });

    it('refuses a delete', async () => {
      const created = await repository.create(a_new_trade());
      await repository.amend(created.tradeId, 1, { quantity: 7500 }, api_context);

      await expect(
        prisma.$executeRawUnsafe(
          'DELETE FROM "trade_event" WHERE "version" = 2 AND "actor" = \'ITEST\'',
        ),
      ).rejects.toThrow();
    });

    it('leaves the row exactly as it was written', async () => {
      const created = await repository.create(a_new_trade({ trader: 'UNTOUCHED' }));
      await repository.amend(created.tradeId, 1, { quantity: 7500 }, api_context);

      await prisma
        .$executeRawUnsafe(
          "UPDATE \"trade_event\" SET \"actor\" = 'TAMPERED' WHERE \"actor\" = 'UNTOUCHED'",
        )
        .catch(() => undefined);

      const [event] = await repository.find_events(created.tradeId);
      expect(event?.actor).toBe('UNTOUCHED');
    });
  });
});
