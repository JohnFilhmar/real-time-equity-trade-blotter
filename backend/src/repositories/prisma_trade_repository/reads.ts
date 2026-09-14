import type { Trade, TradeEvent, TradeEventQuery, TradeQuery } from '@blotter/shared';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { TradeEventPage, TradePage } from '../../interfaces/trade_repository.js';
import { to_wire_event } from '../../lib/mappers/trade_event_mapper.js';
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

/** The Postgres side of `TradeRepository.find_events`. */
export async function find_events(prisma: PrismaClient, trade_id: string): Promise<TradeEvent[]> {
  const rows = await prisma.tradeEvent.findMany({
    where: { trade: { tradeId: trade_id } },
    orderBy: { version: 'asc' },
  });

  return rows.map((row) => to_wire_event(row, trade_id));
}

/** The Postgres side of `TradeRepository.list_events`. */
export async function list_events(
  prisma: PrismaClient,
  query: TradeEventQuery,
): Promise<TradeEventPage> {
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
}

/** The Postgres side of `TradeRepository.find_active_trades`. */
export async function find_active_trades(prisma: PrismaClient, symbol?: string): Promise<Trade[]> {
  const rows = await prisma.trade.findMany({
    where: { status: 'ACTIVE', ...(symbol === undefined ? {} : { symbol }) },
    orderBy: [{ tradeTimestamp: 'asc' }, { id: 'asc' }],
  });

  return rows.map(to_wire_trade);
}

/** The Postgres side of `TradeRepository.find_random_active`. */
export async function find_random_active(prisma: PrismaClient): Promise<Trade | null> {
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
}

/** The Postgres side of `TradeRepository.count_active`. Served by the status-first index. */
export async function count_active(prisma: PrismaClient): Promise<number> {
  return prisma.trade.count({ where: { status: 'ACTIVE' } });
}
