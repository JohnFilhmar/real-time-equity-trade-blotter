import { describe, expect, it } from 'vitest';
import { validation_failed_detail, type Trade } from '@blotter/shared';
import { to_datetime_local_value } from '@/lib/format/clock';
import {
  describe_conflict,
  initial_values,
  parse_amend,
  parse_create,
  shows_required,
  to_refusal_errors,
  to_ticket_errors,
  type TicketErrors,
  type TicketValues,
} from './ticketForm';

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

describe('to_ticket_errors', () => {
  it('places each server message beside the input it names', () => {
    expect(
      to_ticket_errors([
        { field: 'quantity', message: 'Quantity must be a whole number above zero' },
        { field: 'tradeTimestamp', message: 'Trade time cannot be in the future' },
      ]),
    ).toEqual({
      quantity: 'Quantity must be a whole number above zero',
      trade_time: 'Trade time cannot be in the future',
    });
  });

  it('puts a message for a field the ticket does not show on the form line instead of dropping it', () => {
    expect(to_ticket_errors([{ field: 'version', message: 'Reload the trade and try again' }])).toEqual({
      form: 'Reload the trade and try again',
    });
  });

  it('keeps the first message for each input and for the form line', () => {
    expect(
      to_ticket_errors([
        { field: 'book', message: 'Enter a book' },
        { field: 'book', message: 'Book cannot be longer than 64 characters' },
        { field: 'version', message: 'Reload the trade and try again' },
        { field: '', message: 'One or more fields failed validation.' },
      ]),
    ).toEqual({ book: 'Enter a book', form: 'Reload the trade and try again' });
  });
});

describe('to_refusal_errors', () => {
  it('puts a desk-limit refusal on the form line as well as beside the quantity', () => {
    expect(
      to_refusal_errors('This trade is worth £41,000,000, over the £40,000,000 limit for London names.', [
        { field: 'quantity', message: 'This trade is over the desk limit. Lower the quantity or price.' },
      ]),
    ).toEqual({
      quantity: 'This trade is over the desk limit. Lower the quantity or price.',
      form: 'This trade is worth £41,000,000, over the £40,000,000 limit for London names.',
    });
  });

  it("leaves the API's generic sentence for a plain validation failure off the form line", () => {
    expect(to_refusal_errors(validation_failed_detail, [{ field: 'price', message: 'Price must be above zero' }])).toEqual({
      price: 'Price must be above zero',
    });
  });
});

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

describe('shows_required', () => {
  it('marks the counterparty on a new ticket only, so an amendment shows it locked like symbol and time', () => {
    expect(shows_required('counterparty', null)).toBe(true);
    expect(shows_required('counterparty', stored)).toBe(false);
    expect(shows_required('symbol', null)).toBe(false);
  });
});
