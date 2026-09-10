import type { PrismaClient } from '../../generated/prisma/client.js';
import { generate_trades } from './generate_trades.js';

/** Row returned by the trade-id sequence query. */
interface SequenceRow {
  trade_id: string;
}

/**
 * Seeds the blotter if, and only if, it is empty.
 *
 * Business identifiers come from a Postgres sequence rather than a counter in application memory,
 * so ids stay unique if the API is ever run as more than one process.
 *
 * @param prisma - Client used for the count, the sequence read and the insert.
 * @param count - How many trades to create when the table is empty.
 * @returns The number of trades inserted, which is zero when data already existed.
 */
export async function seed_trades_if_empty(prisma: PrismaClient, count: number): Promise<number> {
  if (count <= 0) {
    return 0;
  }

  const existing = await prisma.trade.count();
  if (existing > 0) {
    return 0;
  }

  const generated = generate_trades(count);

  const ids = await prisma.$queryRaw<SequenceRow[]>`
    SELECT 'TRD-' || lpad(nextval('trade_id_seq')::text, 6, '0') AS trade_id
    FROM generate_series(1, ${count})
  `;

  const rows = generated.map((trade, index) => ({
    ...trade,
    tradeId: ids[index]?.trade_id ?? `TRD-${(100_001 + index).toString()}`,
  }));

  const result = await prisma.trade.createMany({ data: rows });
  return result.count;
}
