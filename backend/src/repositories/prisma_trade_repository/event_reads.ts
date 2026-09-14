import type { TradeEvent, TradeEventQuery } from '@blotter/shared';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { TradeEventPage } from '../../interfaces/trade_repository.js';
import { to_wire_event } from '../../lib/mappers/trade_event_mapper.js';
import { decode_cursor, encode_cursor } from '../../lib/paging/cursor.js';

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
