import type { Trade } from '@blotter/shared';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type {
  NewTrade,
  TradeChanges,
  TradeWriteContext,
} from '../../interfaces/trade_repository.js';
import {
  build_cancellation_change_set,
  build_change_set,
} from '../../lib/audit/build_change_set.js';
import { to_wire_trade } from '../../lib/mappers/trade_mapper.js';

/** Row returned by the business-identifier sequence read. */
interface SequenceRow {
  trade_id: string;
}

/** The Postgres side of `TradeRepository.create`. */
export async function create(prisma: PrismaClient, input: NewTrade): Promise<Trade> {
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
}

/** The Postgres side of `TradeRepository.amend`. */
export async function amend(
  prisma: PrismaClient,
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
}

/** The Postgres side of `TradeRepository.cancel`. */
export async function cancel(
  prisma: PrismaClient,
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
}
