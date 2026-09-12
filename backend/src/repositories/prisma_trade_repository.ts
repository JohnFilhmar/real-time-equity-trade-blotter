import type { Position, Trade, TradeEvent, TradeEventQuery, TradeQuery } from '@blotter/shared';
import type { PrismaClient } from '../generated/prisma/client.js';
import type {
  NewTrade,
  TradeEventPage,
  TradePage,
  TradeChanges,
  TradeRepository,
  TradeWriteContext,
} from '../interfaces/trade_repository.js';
import {
  build_cancellation_change_set,
  build_change_set,
} from '../lib/audit/build_change_set.js';
import { to_wire_position, type PositionRow } from '../lib/mappers/position_mapper.js';
import { to_wire_event } from '../lib/mappers/trade_event_mapper.js';
import { to_wire_trade } from '../lib/mappers/trade_mapper.js';
import { decode_cursor, encode_cursor } from '../lib/paging/cursor.js';

/** Row returned by the business-identifier sequence read. */
interface SequenceRow {
  trade_id: string;
}

/**
 * Builds the Prisma `orderBy` for a validated query.
 *
 * Written as a switch rather than a computed key so the sort column stays a literal Prisma knows,
 * and so an unsupported column cannot be smuggled in from the query string. Every column the grid
 * displays appears here.
 *
 * `id` is always the final tiebreaker. Without it two trades with the same timestamp could swap
 * places between requests, which breaks cursor paging: the cursor names a row, and the row has to
 * sit in the same place next time for "everything after it" to mean anything.
 *
 * @param query - The parsed query.
 * @returns An `orderBy` list, most significant first.
 */
function build_order_by(query: TradeQuery) {
  const direction = query.sort_dir;

  switch (query.sort_by) {
    case 'tradeId':
      return [{ tradeId: direction }, { id: direction }];
    case 'symbol':
      return [{ symbol: direction }, { id: direction }];
    case 'side':
      return [{ side: direction }, { id: direction }];
    case 'quantity':
      return [{ quantity: direction }, { id: direction }];
    case 'price':
      return [{ price: direction }, { id: direction }];
    case 'trader':
      return [{ trader: direction }, { id: direction }];
    case 'book':
      return [{ book: direction }, { id: direction }];
    case 'counterparty':
      return [{ counterparty: direction }, { id: direction }];
    case 'status':
      return [{ status: direction }, { id: direction }];
    default:
      return [{ tradeTimestamp: direction }, { id: direction }];
  }
}

/**
 * Builds the Prisma `where` for a validated query.
 *
 * The four free-text filters match case-insensitively on a substring, because they sit behind grid
 * filter boxes where someone typing `equities` expects to find `EQUITIES_UK`. That forgoes the
 * btree indexes on those columns, which is acceptable at the dataset size the brief describes and
 * is recorded as a trade-off in the README. The date range is a half-open interval on the
 * execution timestamp, which is what a "Trade date: Today" filter means.
 *
 * @param query - The parsed query.
 * @returns A `where` carrying only the filters that were supplied.
 */
function build_where(query: TradeQuery) {
  const from = query.date_from === undefined ? {} : { gte: new Date(query.date_from) };
  const to = query.date_to === undefined ? {} : { lte: new Date(query.date_to) };
  const range = { ...from, ...to };

  return {
    ...(query.symbol === undefined
      ? {}
      : { symbol: { contains: query.symbol, mode: 'insensitive' as const } }),
    ...(query.trader === undefined
      ? {}
      : { trader: { contains: query.trader, mode: 'insensitive' as const } }),
    ...(query.book === undefined
      ? {}
      : { book: { contains: query.book, mode: 'insensitive' as const } }),
    ...(query.counterparty === undefined
      ? {}
      : { counterparty: { contains: query.counterparty, mode: 'insensitive' as const } }),
    ...(query.side === undefined ? {} : { side: query.side }),
    ...(query.status === undefined ? {} : { status: query.status }),
    ...(Object.keys(range).length === 0 ? {} : { tradeTimestamp: range }),
  };
}

/**
 * The Postgres-backed implementation of {@link TradeRepository}.
 *
 * Every write is expressed as a conditional `updateMany` rather than a read followed by an update,
 * so the version check and the write happen in one statement and two clients changing the same
 * trade cannot both win. Both writes run inside a transaction with their event row, so the audit
 * trail cannot disagree with the trade.
 *
 * @param prisma - A connected client.
 * @returns A repository bound to that client.
 */
export function create_prisma_trade_repository(prisma: PrismaClient): TradeRepository {
  /**
   * Re-reads a trade, so callers always receive the committed row rather than the shape they
   * hoped they had written.
   *
   * @param trade_id - The trade to re-read.
   * @returns The trade, or `null` when it has since disappeared.
   */
  async function read_back(trade_id: string): Promise<Trade | null> {
    const row = await prisma.trade.findUnique({ where: { tradeId: trade_id } });
    return row === null ? null : to_wire_trade(row);
  }

  return {
    async list(query: TradeQuery): Promise<TradePage> {
      const where = build_where(query);
      const cursor_id = decode_cursor(query.cursor);

      const [rows, total] = await prisma.$transaction([
        prisma.trade.findMany({
          where,
          orderBy: build_order_by(query),
          take: query.limit,
          ...(cursor_id === undefined ? {} : { cursor: { id: cursor_id }, skip: 1 }),
        }),
        prisma.trade.count({ where }),
      ]);

      const last = rows.at(-1);

      return {
        trades: rows.map(to_wire_trade),
        total,
        next_cursor: rows.length === query.limit && last !== undefined ? encode_cursor(last.id) : null,
      };
    },

    async find_by_trade_id(trade_id: string): Promise<Trade | null> {
      return read_back(trade_id);
    },

    async create(input: NewTrade): Promise<Trade> {
      const row = await prisma.$transaction(async (tx) => {
        const sequence_rows = await tx.$queryRawUnsafe<SequenceRow[]>(
          "SELECT 'TRD-' || lpad(nextval('trade_id_seq')::text, 6, '0') AS trade_id",
        );
        const sequence = sequence_rows[0];

        if (sequence === undefined) {
          throw new Error('trade_id_seq returned no value');
        }

        return tx.trade.create({
          data: {
            tradeId: sequence.trade_id,
            symbol: input.symbol,
            side: input.side,
            quantity: input.quantity,
            price: input.price.toFixed(6),
            currency: input.currency,
            trader: input.trader,
            book: input.book,
            counterparty: input.counterparty,
            tradeTimestamp: new Date(input.tradeTimestamp),
          },
        });
      });

      return to_wire_trade(row);
    },

    async amend(
      trade_id: string,
      expected_version: number,
      changes: TradeChanges,
      context: TradeWriteContext,
    ): Promise<Trade | null> {
      return prisma.$transaction(async (tx) => {
        const existing = await tx.trade.findUnique({ where: { tradeId: trade_id } });

        if (
          existing === null ||
          existing.status !== 'ACTIVE' ||
          existing.version !== expected_version
        ) {
          return null;
        }

        const before = to_wire_trade(existing);

        const updated = await tx.trade.updateMany({
          where: { tradeId: trade_id, version: expected_version, status: 'ACTIVE' },
          data: {
            ...(changes.quantity === undefined ? {} : { quantity: changes.quantity }),
            ...(changes.price === undefined ? {} : { price: changes.price.toFixed(6) }),
            ...(changes.counterparty === undefined ? {} : { counterparty: changes.counterparty }),
            ...(changes.book === undefined ? {} : { book: changes.book }),
            version: { increment: 1 },
          },
        });

        // Another client amended the same trade between the read above and this write. The
        // conditional where clause is what makes that a lost race rather than a lost update.
        if (updated.count === 0) {
          return null;
        }

        const after = await tx.trade.findUnique({ where: { tradeId: trade_id } });

        if (after === null) {
          return null;
        }

        await tx.tradeEvent.create({
          data: {
            tradeUuid: existing.id,
            version: after.version,
            action: 'AMENDED',
            source: context.source,
            changes: build_change_set(before, changes),
            actor: context.actor ?? before.trader,
          },
        });

        return to_wire_trade(after);
      });
    },

    async cancel(
      trade_id: string,
      expected_version: number | undefined,
      context: TradeWriteContext,
    ): Promise<Trade | null> {
      return prisma.$transaction(async (tx) => {
        const existing = await tx.trade.findUnique({ where: { tradeId: trade_id } });

        if (
          existing === null ||
          existing.status !== 'ACTIVE' ||
          (expected_version !== undefined && existing.version !== expected_version)
        ) {
          return null;
        }

        const updated = await tx.trade.updateMany({
          where: {
            tradeId: trade_id,
            status: 'ACTIVE',
            ...(expected_version === undefined ? {} : { version: expected_version }),
          },
          data: { status: 'CANCELLED', version: { increment: 1 } },
        });

        if (updated.count === 0) {
          return null;
        }

        const after = await tx.trade.findUnique({ where: { tradeId: trade_id } });

        if (after === null) {
          return null;
        }

        await tx.tradeEvent.create({
          data: {
            tradeUuid: existing.id,
            version: after.version,
            action: 'CANCELLED',
            source: context.source,
            changes: build_cancellation_change_set(),
            actor: context.actor ?? existing.trader,
          },
        });

        return to_wire_trade(after);
      });
    },

    async find_events(trade_id: string): Promise<TradeEvent[]> {
      const rows = await prisma.tradeEvent.findMany({
        where: { trade: { tradeId: trade_id } },
        orderBy: { version: 'asc' },
      });

      return rows.map((row) => to_wire_event(row, trade_id));
    },

    async list_events(query: TradeEventQuery): Promise<TradeEventPage> {
      const cursor_id = decode_cursor(query.cursor);

      const [rows, total] = await prisma.$transaction([
        prisma.tradeEvent.findMany({
          include: { trade: { select: { tradeId: true } } },
          orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
          take: query.limit,
          ...(cursor_id === undefined ? {} : { cursor: { id: cursor_id }, skip: 1 }),
        }),
        prisma.tradeEvent.count(),
      ]);

      const last = rows.at(-1);

      return {
        events: rows.map((row) => to_wire_event(row, row.trade.tradeId)),
        total,
        next_cursor:
          rows.length === query.limit && last !== undefined ? encode_cursor(last.id) : null,
      };
    },

    async aggregate_positions(): Promise<Position[]> {
      // The two quantity sums are cast to int because Postgres widens a summed integer to bigint.
      // The notional is left as numeric so the mapper converts it exactly the way it converts a
      // price.
      const rows = await prisma.$queryRaw<PositionRow[]>`
        SELECT
          "symbol",
          "currency",
          SUM(CASE WHEN "side" = 'BUY' THEN "quantity" ELSE 0 END)::int AS "buyQuantity",
          SUM(CASE WHEN "side" = 'SELL' THEN "quantity" ELSE 0 END)::int AS "sellQuantity",
          SUM("quantity" * "price") AS "grossNotional",
          COUNT(*)::int AS "tradeCount"
        FROM "trade"
        WHERE "status" = 'ACTIVE'
        GROUP BY "symbol", "currency"
        ORDER BY "symbol" ASC
      `;

      return rows.map(to_wire_position);
    },

    async find_random_active(): Promise<Trade | null> {
      const total = await prisma.trade.count({ where: { status: 'ACTIVE' } });

      if (total === 0) {
        return null;
      }

      const row = await prisma.trade.findFirst({
        where: { status: 'ACTIVE' },
        orderBy: { createdAt: 'asc' },
        skip: Math.floor(Math.random() * total),
      });

      return row === null ? null : to_wire_trade(row);
    },
  };
}
