import type { Trade } from '@blotter/shared';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { to_wire_trade } from '../../lib/mappers/trade_mapper.js';

/** The Postgres side of `TradeRepository.count_active`. Served by the status-first index. */
export async function count_active(prisma: PrismaClient): Promise<number> {
  return prisma.trade.count({ where: { status: 'ACTIVE' } });
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
  const total = await count_active(prisma);

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
