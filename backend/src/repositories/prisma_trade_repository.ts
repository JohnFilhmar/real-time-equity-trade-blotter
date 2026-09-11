import type { CreateTrade, Trade, TradeQuery } from '@blotter/shared';
import type { PrismaClient } from '../generated/prisma/client.js';
import type { TradePage, TradeChanges, TradeRepository } from '../interfaces/trade_repository.js';
import { to_wire_trade } from '../lib/mappers/trade_mapper.js';

/** Row returned by the business-identifier sequence read. */
interface SequenceRow {
  trade_id: string;
}

/**
 * Builds the Prisma `orderBy` for a validated query.
 *
 * Written as a switch rather than a computed key so the sort column stays a literal Prisma knows,
 * and so an unsupported column cannot be smuggled in from the query string.
 *
 * @param query - The parsed query.
 * @returns An `orderBy` naming exactly one column.
 */
function build_order_by(query: TradeQuery) {
  switch (query.sort_by) {
    case 'symbol':
      return { symbol: query.sort_dir };
    case 'quantity':
      return { quantity: query.sort_dir };
    case 'price':
      return { price: query.sort_dir };
    case 'trader':
      return { trader: query.sort_dir };
    default:
      return { tradeTimestamp: query.sort_dir };
  }
}

/**
 * Builds the Prisma `where` for a validated query.
 *
 * The three free-text filters match case-insensitively on a substring, because they sit behind
 * grid filter boxes where someone typing `equities` expects to find `EQUITIES_UK`. That forgoes the
 * btree indexes on those columns, which is acceptable at the dataset size the brief describes and
 * is recorded as a trade-off in the README.
 *
 * @param query - The parsed query.
 * @returns A `where` carrying only the filters that were supplied.
 */
function build_where(query: TradeQuery) {
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
    ...(query.side === undefined ? {} : { side: query.side }),
    ...(query.status === undefined ? {} : { status: query.status }),
  };
}

/**
 * The Postgres-backed implementation of {@link TradeRepository}.
 *
 * Every write is expressed as a conditional `updateMany` rather than a read followed by an update,
 * so the version check and the write happen in one statement and two clients amending the same
 * trade cannot both win.
 *
 * @param prisma - A connected client.
 * @returns A repository bound to that client.
 */
export function create_prisma_trade_repository(prisma: PrismaClient): TradeRepository {
  /**
   * Re-reads a trade after a conditional write, so callers always receive the committed row
   * rather than the shape they hoped they had written.
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

      const [rows, total] = await prisma.$transaction([
        prisma.trade.findMany({
          where,
          orderBy: build_order_by(query),
          take: query.limit,
          skip: query.offset,
        }),
        prisma.trade.count({ where }),
      ]);

      return { trades: rows.map(to_wire_trade), total };
    },

    async find_by_trade_id(trade_id: string): Promise<Trade | null> {
      return read_back(trade_id);
    },

    async create(input: CreateTrade): Promise<Trade> {
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
    ): Promise<Trade | null> {
      const updated = await prisma.trade.updateMany({
        where: { tradeId: trade_id, version: expected_version, status: 'ACTIVE' },
        data: {
          ...(changes.symbol === undefined ? {} : { symbol: changes.symbol }),
          ...(changes.side === undefined ? {} : { side: changes.side }),
          ...(changes.quantity === undefined ? {} : { quantity: changes.quantity }),
          ...(changes.price === undefined ? {} : { price: changes.price.toFixed(6) }),
          ...(changes.trader === undefined ? {} : { trader: changes.trader }),
          ...(changes.book === undefined ? {} : { book: changes.book }),
          ...(changes.counterparty === undefined ? {} : { counterparty: changes.counterparty }),
          ...(changes.tradeTimestamp === undefined
            ? {}
            : { tradeTimestamp: new Date(changes.tradeTimestamp) }),
          version: { increment: 1 },
        },
      });

      return updated.count === 0 ? null : read_back(trade_id);
    },

    async cancel(trade_id: string, expected_version?: number): Promise<Trade | null> {
      const updated = await prisma.trade.updateMany({
        where: {
          tradeId: trade_id,
          status: 'ACTIVE',
          ...(expected_version === undefined ? {} : { version: expected_version }),
        },
        data: { status: 'CANCELLED', version: { increment: 1 } },
      });

      return updated.count === 0 ? null : read_back(trade_id);
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
