import { describe, expect, it } from 'vitest';
import type { Trade } from '@blotter/shared';
import { to_datetime_local_value } from '@/lib/format/clock';
import type { TicketErrors, TicketValues } from '@/types/ticket';
import { parse_create, shows_required } from './values';

/** A stored trade, standing in for the trade an amendment opens the ticket on. */
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
 * A new ticket that validates, timed a minute ago so the future-time rule never fires by accident.
 *
 * @param overrides - Inputs to replace.
 * @returns The ticket's inputs.
 */
function a_ticket(overrides: Partial<TicketValues> = {}): TicketValues {
  return {
    symbol: 'AAPL',
    side: 'BUY',
    quantity: '5000',
    price: '227.45',
    book: 'EQUITIES_US',
    counterparty: 'Goldman Sachs',
    trade_time: to_datetime_local_value(new Date(Date.now() - 60_000)),
    ...overrides,
  };
}

/**
 * Validates a new ticket and returns what it would show.
 *
 * @param overrides - Inputs to change from a ticket that validates.
 * @returns The messages keyed by input. Empty when the ticket books.
 */
function create_errors(overrides: Partial<TicketValues>): TicketErrors {
  const parsed = parse_create(a_ticket(overrides));
  return parsed.ok ? {} : parsed.errors;
}

describe('parse_create', () => {
  it('books a ticket that breaks no rule', () => {
    expect(create_errors({})).toEqual({});
  });

  it('reads an empty quantity box as missing rather than as zero', () => {
    expect(create_errors({ quantity: '' })).toEqual({ quantity: 'Enter a quantity' });
    expect(create_errors({ quantity: '   ' })).toEqual({ quantity: 'Enter a quantity' });
  });

  it('asks for a quantity when the box does not hold a number', () => {
    expect(create_errors({ quantity: 'lots' })).toEqual({ quantity: 'Enter a quantity' });
  });

  it('says a quantity must be a whole number above zero', () => {
    for (const quantity of ['0', '-100', '150.5']) {
      expect(create_errors({ quantity })).toEqual({ quantity: 'Quantity must be a whole number above zero' });
    }
  });

  it('caps the quantity at ten million, however large the number typed', () => {
    expect(create_errors({ quantity: '10000000' })).toEqual({});
    for (const quantity of ['10000001', '100000000000000000000']) {
      expect(create_errors({ quantity })).toEqual({ quantity: 'Quantity cannot be more than 10,000,000' });
    }
  });

  it('reads an empty price box as missing rather than as zero', () => {
    expect(create_errors({ price: '' })).toEqual({ price: 'Enter a price' });
  });

  it('asks for a price when the box does not hold a number', () => {
    expect(create_errors({ price: 'market' })).toEqual({ price: 'Enter a price' });
  });

  it('says a price must be above zero', () => {
    for (const price of ['0', '-1.5']) {
      expect(create_errors({ price })).toEqual({ price: 'Price must be above zero' });
    }
  });

  it('caps the price at ten million', () => {
    expect(create_errors({ price: '10000000.01' })).toEqual({ price: 'Price cannot be more than 10,000,000' });
  });

  it('asks for a book, and says how long one may be', () => {
    expect(create_errors({ book: '' })).toEqual({ book: 'Enter a book' });
    expect(create_errors({ book: '   ' })).toEqual({ book: 'Enter a book' });
    expect(create_errors({ book: 'B'.repeat(65) })).toEqual({ book: 'Book cannot be longer than 64 characters' });
  });

  it('asks for a counterparty, and says how long one may be', () => {
    expect(create_errors({ counterparty: '' })).toEqual({ counterparty: 'Enter a counterparty' });
    expect(create_errors({ counterparty: '   ' })).toEqual({ counterparty: 'Enter a counterparty' });
    expect(create_errors({ counterparty: 'C'.repeat(129) })).toEqual({
      counterparty: 'Counterparty cannot be longer than 128 characters',
    });
  });

  it('accepts a counterparty that is not among the suggestions', () => {
    expect(create_errors({ counterparty: 'Rothschild & Co' })).toEqual({});
  });

  it('asks for a readable trade time', () => {
    expect(create_errors({ trade_time: '' })).toEqual({ trade_time: 'Enter the trade time as a valid date and time' });
  });

  it('refuses a trade time in the future', () => {
    const tomorrow = to_datetime_local_value(new Date(Date.now() + 24 * 60 * 60 * 1000));

    expect(create_errors({ trade_time: tomorrow })).toEqual({ trade_time: 'Trade time cannot be in the future' });
  });

  it('asks for a symbol from the list', () => {
    expect(create_errors({ symbol: 'ZZZZ' })).toEqual({ symbol: 'Choose a symbol from the list' });
  });
});

describe('shows_required', () => {
  it('marks the counterparty on a new ticket only, so an amendment shows it locked like symbol and time', () => {
    expect(shows_required('counterparty', null)).toBe(true);
    expect(shows_required('counterparty', stored)).toBe(false);
    expect(shows_required('symbol', null)).toBe(false);
  });
});
