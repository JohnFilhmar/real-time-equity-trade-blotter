import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { trade_query_schema, trade_sort_columns, type CreateTrade } from '@blotter/shared';
import { PrismaClient } from '../generated/prisma/client.js';
import type { TradeRepository } from '../interfaces/trade_repository.js';
import { create_prisma_trade_repository } from './prisma_trade_repository.js';

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

/**
 * A valid create payload inside this run's isolated book.
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

  beforeAll(() => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: test_database_url }),
    });
    repository = create_prisma_trade_repository(prisma);
  });

  afterAll(async () => {
    await prisma.trade.deleteMany({ where: { book: test_book } });
    await prisma.$disconnect();
  });

  it('assigns a business identifier from the database sequence', async () => {
    const first = await repository.create(a_create_payload());
    const second = await repository.create(a_create_payload());

    expect(first.tradeId).toMatch(/^TRD-\d{6,}$/);
    expect(second.tradeId).not.toBe(first.tradeId);
  });

  it('round-trips a price through numeric(18,6) without losing precision', async () => {
    const created = await repository.create(a_create_payload({ price: 1234.567891 }));

    const read_back = await repository.find_by_trade_id(created.tradeId);

    expect(read_back?.price).toBe(1234.567891);
  });

  it('stores a new trade as ACTIVE at version 1', async () => {
    const created = await repository.create(a_create_payload());

    expect(created.status).toBe('ACTIVE');
    expect(created.version).toBe(1);
  });

  it('filters, counts and pages independently', async () => {
    await repository.create(a_create_payload({ symbol: 'MSFT' }));
    await repository.create(a_create_payload({ symbol: 'MSFT' }));
    await repository.create(a_create_payload({ symbol: 'TSLA' }));

    const page = await repository.list(
      trade_query_schema.parse({ book: test_book, symbol: 'MSFT', limit: '1' }),
    );

    expect(page.trades).toHaveLength(1);
    expect(page.total).toBeGreaterThanOrEqual(2);
  });

  it('amends only when the version still matches', async () => {
    const created = await repository.create(a_create_payload());

    const amended = await repository.amend(created.tradeId, created.version, { quantity: 7500 });
    const stale = await repository.amend(created.tradeId, created.version, { quantity: 9000 });

    expect(amended?.quantity).toBe(7500);
    expect(amended?.version).toBe(2);
    expect(stale).toBeNull();
  });

  it('refuses to amend a cancelled trade', async () => {
    const created = await repository.create(a_create_payload());
    const cancelled = await repository.cancel(created.tradeId);

    const amended = await repository.amend(created.tradeId, cancelled?.version ?? 2, {
      quantity: 100,
    });

    expect(cancelled?.status).toBe('CANCELLED');
    expect(amended).toBeNull();
  });

  it('cancels once and only once', async () => {
    const created = await repository.create(a_create_payload());

    const first = await repository.cancel(created.tradeId);
    const second = await repository.cancel(created.tradeId);

    expect(first?.status).toBe('CANCELLED');
    expect(second).toBeNull();
  });

  it('answers null for a trade that does not exist', async () => {
    await expect(repository.find_by_trade_id('TRD-000001')).resolves.toBeNull();
  });
});

describe.skipIf(test_database_url === undefined)('prisma trade repository, audit trail', () => {
  let prisma: PrismaClient;
  let repository: TradeRepository;

  beforeAll(() => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: test_database_url }),
    });
    repository = create_prisma_trade_repository(prisma);
  });

  afterAll(async () => {
    await prisma.trade.deleteMany({ where: { book: test_book } });
    await prisma.$disconnect();
  });

  it('writes one amendment row per successful amend', async () => {
    const created = await repository.create(a_create_payload({ quantity: 5000 }));
    await repository.amend(created.tradeId, 1, { quantity: 7500 });
    await repository.amend(created.tradeId, 2, { price: 999.5 });

    const history = await repository.find_amendments(created.tradeId);

    expect(history.map((entry) => entry.version)).toEqual([2, 3]);
  });

  it('records both sides of every field that moved', async () => {
    const created = await repository.create(a_create_payload({ quantity: 5000 }));
    await repository.amend(created.tradeId, 1, { quantity: 7500 });

    const [amendment] = await repository.find_amendments(created.tradeId);

    expect(amendment?.changes).toEqual({ quantity: { from: 5000, to: 7500 } });
  });

  it('attributes to the supplied actor, and otherwise to the trade trader', async () => {
    const explicit = await repository.create(a_create_payload({ trader: 'JSMITH' }));
    await repository.amend(explicit.tradeId, 1, { trader: 'ABROWN' }, 'ABROWN');

    const implicit = await repository.create(a_create_payload({ trader: 'MJONES' }));
    await repository.amend(implicit.tradeId, 1, { quantity: 400 });

    const [explicit_row] = await repository.find_amendments(explicit.tradeId);
    const [implicit_row] = await repository.find_amendments(implicit.tradeId);

    expect(explicit_row?.amendedBy).toBe('ABROWN');
    expect(implicit_row?.amendedBy).toBe('MJONES');
  });

  it('writes no amendment row when the version check fails', async () => {
    const created = await repository.create(a_create_payload());

    const stale = await repository.amend(created.tradeId, 99, { quantity: 100 });

    expect(stale).toBeNull();
    await expect(repository.find_amendments(created.tradeId)).resolves.toEqual([]);
  });

  it('answers an empty history for a trade that exists and was never amended', async () => {
    const created = await repository.create(a_create_payload());

    await expect(repository.find_amendments(created.tradeId)).resolves.toEqual([]);
  });

  it('filters on counterparty case-insensitively', async () => {
    await repository.create(a_create_payload({ counterparty: 'Nomura' }));

    const page = await repository.list(
      trade_query_schema.parse({ book: test_book, counterparty: 'nomu' }),
    );

    expect(page.total).toBeGreaterThanOrEqual(1);
    expect(page.trades.every((trade) => trade.counterparty === 'Nomura')).toBe(true);
  });

  it('accepts every sort column the grid will offer', async () => {
    await repository.create(a_create_payload());

    for (const column of trade_sort_columns) {
      const page = await repository.list(
        trade_query_schema.parse({ book: test_book, sort_by: column, limit: '5' }),
      );

      expect(page.trades.length).toBeGreaterThan(0);
    }
  });
});
