import type { Trade, TradeQuery } from '@blotter/shared';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { TradePage } from '../../interfaces/trade_repository.js';
import { to_wire_trade } from '../../lib/mappers/trade_mapper.js';
import { decode_cursor, encode_cursor } from '../../lib/paging/cursor.js';
import { build_order_by, build_where } from './query.js';

/** The Postgres side of `TradeRepository.list`. */
export async function list(prisma: PrismaClient, query: TradeQuery): Promise<TradePage> {
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
}

/** The Postgres side of `TradeRepository.find_by_trade_id`. */
export async function find_by_trade_id(
  prisma: PrismaClient,
  trade_id: string,
): Promise<Trade | null> {
  const row = await prisma.trade.findUnique({ where: { tradeId: trade_id } });
  return row === null ? null : to_wire_trade(row);
}
