import { describe, expect, it } from 'vitest';
import type { Trade } from '@blotter/shared';
import type { TicketErrors, TicketValues } from '@/types/ticket';
import { parse_amend } from './amend';
import { initial_values } from './values';

/** A stored trade to amend, at version 3 so the echoed version is visibly the trade's own. */
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

/**
 * Validates an amendment of the stored trade and returns what it would show.
 *
 * @param overrides - Inputs to change from the trade's own values.
 * @returns The messages keyed by input. Empty when the amendment saves.
 */
function amend_errors(overrides: Partial<TicketValues>): TicketErrors {
  const parsed = parse_amend({ ...initial_values(stored), ...overrides }, stored);
  return parsed.ok ? {} : parsed.errors;
}

describe('parse_amend', () => {
  it('sends only what changed, with the version the ticket opened on', () => {
    expect(parse_amend({ ...initial_values(stored), price: '230.1' }, stored)).toStrictEqual({
      ok: true,
      input: { version: 3, price: 230.1 },
    });
  });

  it('refuses to save when nothing changed', () => {
    expect(amend_errors({})).toEqual({ form: 'Change at least one field before saving' });
  });

  it('reads an emptied quantity box as missing rather than as zero', () => {
    expect(amend_errors({ quantity: '' })).toEqual({ quantity: 'Enter a quantity' });
  });

  it('reads an emptied price box as missing rather than as zero', () => {
    expect(amend_errors({ price: '' })).toEqual({ price: 'Enter a price' });
  });

  it('names the rule a changed quantity breaks', () => {
    expect(amend_errors({ quantity: '0' })).toEqual({ quantity: 'Quantity must be a whole number above zero' });
  });

  it('never sends a counterparty, which is fixed once the trade is booked', () => {
    expect(parse_amend({ ...initial_values(stored), quantity: '6000', counterparty: 'Nomura' }, stored)).toStrictEqual({
      ok: true,
      input: { version: 3, quantity: 6000 },
    });
    expect(amend_errors({ counterparty: 'Nomura' })).toEqual({ form: 'Change at least one field before saving' });
  });
});
