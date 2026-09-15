import { describe, expect, it } from 'vitest';
import type { Trade } from '@blotter/shared';
import { describe_conflict } from './conflict';

/** A stored trade at version 3, the version the ticket opened on. */
const stored: Trade = {
  id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  tradeId: 'TRD-100001',
  symbol: 'AAPL',
  side: 'BUY',
  quantity: 5000,
  price: 227.45,
  currency: 'USD',
  trader: 'JSMITH',
  book: 'EQUITIES_US',
  counterparty: 'Goldman Sachs',
  tradeTimestamp: '2026-08-18T09:15:23.000Z',
  status: 'ACTIVE',
  version: 3,
  createdAt: '2026-08-18T09:15:24.000Z',
  updatedAt: '2026-08-18T09:15:24.000Z',
};

describe('describe_conflict', () => {
  it('names each change by its ticket label and shows both values the way the ticket does', () => {
    expect(
      describe_conflict({ ...stored, quantity: 1_300 }, { ...stored, quantity: 1_400, price: 229.1, version: 4 }),
    ).toEqual({ kind: 'amended', lines: ['Quantity 1,300 → 1,400', 'Price 227.45 → 229.10'] });

    expect(describe_conflict({ ...stored, price: 2814 }, { ...stored, price: 2830.5, version: 4 })).toEqual({
      kind: 'amended',
      lines: ['Price 2,814.00 → 2,830.50'],
    });
  });

  it('covers the book and the counterparty, and lists nothing when only the version moved', () => {
    const moved: Trade = { ...stored, book: 'EQUITIES_UK', counterparty: 'Nomura', version: 4 };

    expect(describe_conflict(stored, moved)).toEqual({
      kind: 'amended',
      lines: ['Book EQUITIES_US → EQUITIES_UK', 'Counterparty Goldman Sachs → Nomura'],
    });
    expect(describe_conflict(stored, { ...stored, version: 4 })).toEqual({ kind: 'amended', lines: [] });
  });

  it('gives a cancelled trade only the cancellation sentence, with no field lines and nothing to reopen', () => {
    expect(describe_conflict(stored, { ...stored, quantity: 1_400, status: 'CANCELLED', version: 5 })).toEqual({
      kind: 'cancelled',
      sentence: 'Another desk cancelled this trade, so it can no longer be amended.',
    });
  });
});
