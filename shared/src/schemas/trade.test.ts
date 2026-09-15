import { describe, expect, it } from 'vitest';
import type { ZodType } from 'zod';
import {
  amend_trade_schema,
  cancel_trade_schema,
  create_trade_schema,
  trade_list_schema,
  trade_query_schema,
  trade_schema,
  trade_sort_columns,
} from './trade.js';
import { instruments } from '../reference/instruments.js';

const valid_trade = {
  id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  tradeId: 'TRD-100001',
  symbol: 'AAPL',
  side: 'BUY',
  quantity: 5000,
  price: 227.45,
  currency: 'USD',
  trader: 'JSMITH',
  book: 'EQUITIES_UK',
  counterparty: 'Goldman Sachs',
  tradeTimestamp: '2026-08-18T09:15:23Z',
  status: 'ACTIVE',
  version: 1,
  createdAt: '2026-08-18T09:15:23Z',
  updatedAt: '2026-08-18T09:15:23Z',
};

/** A create payload dated a minute ago, so the future-timestamp rule never fires by accident. */
function a_create_payload(overrides: Record<string, unknown> = {}) {
  return {
    symbol: 'AAPL',
    side: 'BUY',
    quantity: 5000,
    price: 227.45,
    trader: 'JSMITH',
    book: 'EQUITIES_UK',
    counterparty: 'Goldman Sachs',
    tradeTimestamp: new Date(Date.now() - 60_000).toISOString(),
    ...overrides,
  };
}

/**
 * Every message a schema gives for one top-level field, in the order it gives them.
 *
 * @param schema - The schema to run.
 * @param input - The payload to parse.
 * @param field - The field whose messages to collect.
 * @returns The messages. Empty when that field broke no rule.
 */
function messages_for(schema: ZodType, input: unknown, field: string): string[] {
  const result = schema.safeParse(input);
  return result.success
    ? []
    : result.error.issues.filter((issue) => issue.path[0] === field).map((issue) => issue.message);
}

describe('trade_schema', () => {
  it('accepts the payload shape the brief supplies', () => {
    expect(trade_schema.safeParse(valid_trade).success).toBe(true);
  });

  it('rejects a fractional quantity, since shares are not divisible here', () => {
    expect(trade_schema.safeParse({ ...valid_trade, quantity: 1.5 }).success).toBe(false);
  });

  it('rejects an empty trader', () => {
    expect(trade_schema.safeParse({ ...valid_trade, trader: '   ' }).success).toBe(false);
  });

  it('asks for Buy or Sell, and for a symbol from the list', () => {
    expect(messages_for(trade_schema, { ...valid_trade, side: 'HOLD' }, 'side')).toEqual(['Choose Buy or Sell']);
    expect(messages_for(trade_schema, { ...valid_trade, symbol: 'ZZZZ' }, 'symbol')).toEqual([
      'Choose a symbol from the list',
    ]);
  });

  it('reads a quantity or price that is absent or not a number as missing', () => {
    for (const value of [undefined, null, '5000', Number.NaN]) {
      expect(messages_for(trade_schema, { ...valid_trade, quantity: value }, 'quantity')).toEqual([
        'Enter a quantity',
      ]);
      expect(messages_for(trade_schema, { ...valid_trade, price: value }, 'price')).toEqual(['Enter a price']);
    }
  });

  it('says a quantity must be a whole number above zero, and caps it at ten million, once each', () => {
    for (const quantity of [0, -100, 1.5, -1e20]) {
      expect(messages_for(trade_schema, { ...valid_trade, quantity }, 'quantity')).toEqual([
        'Quantity must be a whole number above zero',
      ]);
    }
    for (const quantity of [10_000_001, 1e20]) {
      expect(messages_for(trade_schema, { ...valid_trade, quantity }, 'quantity')).toEqual([
        'Quantity cannot be more than 10,000,000',
      ]);
    }
  });

  it('names the length a trader code must be', () => {
    for (const trader of ['   ', 'T'.repeat(33)]) {
      expect(messages_for(trade_schema, { ...valid_trade, trader }, 'trader')).toEqual([
        'Trader code must be 1 to 32 characters',
      ]);
    }
  });

  it('asks for a readable trade time and a current version', () => {
    expect(messages_for(trade_schema, { ...valid_trade, tradeTimestamp: 'yesterday' }, 'tradeTimestamp')).toEqual([
      'Enter the trade time as a valid date and time',
    ]);
    expect(messages_for(trade_schema, { ...valid_trade, version: 0 }, 'version')).toEqual([
      'Reload the trade and try again',
    ]);
  });

  it('rejects a symbol outside the tradable universe', () => {
    expect(trade_schema.safeParse({ ...valid_trade, symbol: 'ZZZZ' }).success).toBe(false);
    expect(trade_schema.safeParse({ ...valid_trade, symbol: 'aapl' }).success).toBe(false);
  });

  it('accepts every symbol the universe actually lists', () => {
    for (const instrument of instruments) {
      expect(trade_schema.safeParse({ ...valid_trade, symbol: instrument.symbol }).success).toBe(
        true,
      );
    }
  });

  it('rejects a currency it does not quote in', () => {
    expect(trade_schema.safeParse({ ...valid_trade, currency: 'EUR' }).success).toBe(false);
  });

  it('rejects a status outside the two the brief allows', () => {
    expect(trade_schema.safeParse({ ...valid_trade, status: 'AMENDED' }).success).toBe(false);
  });

  it('rejects a business id that does not follow the TRD- form', () => {
    expect(trade_schema.safeParse({ ...valid_trade, tradeId: '100001' }).success).toBe(false);
  });
});

describe('create_trade_schema', () => {
  it('strips the fields the server owns, so a client cannot set them', () => {
    const parsed = create_trade_schema.parse({
      ...a_create_payload(),
      id: valid_trade.id,
      tradeId: 'TRD-999999',
      currency: 'GBX',
      status: 'CANCELLED',
      version: 99,
    });

    expect(parsed).not.toHaveProperty('id');
    expect(parsed).not.toHaveProperty('tradeId');
    expect(parsed).not.toHaveProperty('status');
    expect(parsed).not.toHaveProperty('version');
  });

  it('does not accept a currency, because the instrument decides it', () => {
    const parsed = create_trade_schema.parse({ ...a_create_payload(), currency: 'GBX' });

    expect(parsed).not.toHaveProperty('currency');
  });

  it('still requires the fields a trade cannot exist without', () => {
    expect(create_trade_schema.safeParse({ symbol: 'AAPL' }).success).toBe(false);
  });

  it('inherits validation from the canonical schema rather than restating it', () => {
    expect(create_trade_schema.safeParse(a_create_payload({ quantity: -1 })).success).toBe(false);
    expect(create_trade_schema.safeParse(a_create_payload({ price: 0 })).success).toBe(false);
    expect(create_trade_schema.safeParse(a_create_payload({ symbol: 'ZZZZ' })).success).toBe(false);
  });

  it('rejects a trade executed in the future', () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const result = create_trade_schema.safeParse(a_create_payload({ tradeTimestamp: tomorrow }));

    expect(result.success).toBe(false);
  });

  it('calls a future trade time exactly that, and an unreadable one only unreadable', () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    expect(
      messages_for(create_trade_schema, a_create_payload({ tradeTimestamp: tomorrow }), 'tradeTimestamp'),
    ).toEqual(['Trade time cannot be in the future']);
    expect(
      messages_for(create_trade_schema, a_create_payload({ tradeTimestamp: 'not a time' }), 'tradeTimestamp'),
    ).toEqual(['Enter the trade time as a valid date and time']);
  });

  it('tolerates a client clock a few seconds fast', () => {
    const slightly_ahead = new Date(Date.now() + 5_000).toISOString();

    expect(
      create_trade_schema.safeParse(a_create_payload({ tradeTimestamp: slightly_ahead })).success,
    ).toBe(true);
  });
});

describe('amend_trade_schema', () => {
  it('allows a partial update but insists on the version being echoed back', () => {
    expect(amend_trade_schema.safeParse({ version: 2, quantity: 100 }).success).toBe(true);
    expect(amend_trade_schema.safeParse({ quantity: 100 }).success).toBe(false);
  });

  it('asks for a reload when the version is missing', () => {
    expect(messages_for(amend_trade_schema, { quantity: 100 }, 'version')).toEqual([
      'Reload the trade and try again',
    ]);
  });

  it('permits the fields a desk genuinely corrects', () => {
    const result = amend_trade_schema.safeParse({
      version: 1,
      quantity: 100,
      price: 1.5,
      book: 'EQUITIES_UK',
    });

    expect(result.success).toBe(true);
  });

  it('refuses a counterparty, saying how to change one instead', () => {
    const result = amend_trade_schema.safeParse({ version: 1, quantity: 100, counterparty: 'Nomura' });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual([
      expect.objectContaining({
        path: ['counterparty'],
        message: 'Counterparty cannot be changed on an amendment. Cancel the trade and book it again.',
      }),
    ]);
  });

  it('refuses to re-point a trade at another instrument or flip its side', () => {
    const amended = amend_trade_schema.parse({
      version: 1,
      symbol: 'MSFT',
      side: 'SELL',
      tradeTimestamp: '2026-08-18T09:15:23Z',
      quantity: 100,
    });

    expect(amended).not.toHaveProperty('symbol');
    expect(amended).not.toHaveProperty('side');
    expect(amended).not.toHaveProperty('tradeTimestamp');
  });
});

describe('cancel_trade_schema', () => {
  it('lets a client cancel without a version, and asks for a reload when the version it echoes is unusable', () => {
    expect(cancel_trade_schema.safeParse({}).success).toBe(true);
    expect(cancel_trade_schema.safeParse({ version: 3 }).success).toBe(true);

    for (const version of [0, -1, 1.5, '3']) {
      expect(messages_for(cancel_trade_schema, { version }, 'version')).toEqual([
        'Reload the trade and try again',
      ]);
    }
  });
});

describe('trade_query_schema', () => {
  it('defaults to the newest trades first', () => {
    const parsed = trade_query_schema.parse({});

    expect(parsed.sort_by).toBe('tradeTimestamp');
    expect(parsed.sort_dir).toBe('desc');
    expect(parsed.limit).toBe(100);
    expect(parsed.cursor).toBeUndefined();
  });

  it('coerces numeric query strings, which arrive as text', () => {
    const parsed = trade_query_schema.parse({ limit: '25' });

    expect(parsed.limit).toBe(25);
  });

  it('caps the page size so one request cannot pull the whole table', () => {
    expect(trade_query_schema.safeParse({ limit: '5000' }).success).toBe(false);
  });

  it('accepts every column the grid can display', () => {
    for (const column of trade_sort_columns) {
      expect(trade_query_schema.safeParse({ sort_by: column }).success).toBe(true);
    }
  });

  it('accepts a trade-date range', () => {
    const parsed = trade_query_schema.parse({
      date_from: '2026-08-18T00:00:00Z',
      date_to: '2026-08-18T23:59:59Z',
    });

    expect(parsed.date_from).toBe('2026-08-18T00:00:00Z');
    expect(parsed.date_to).toBe('2026-08-18T23:59:59Z');
  });

  it('rejects a date that is not a timestamp', () => {
    expect(trade_query_schema.safeParse({ date_from: 'yesterday' }).success).toBe(false);
  });

  it('accepts a range whose ends are the same instant', () => {
    const instant = '2026-08-18T09:15:00Z';

    expect(trade_query_schema.safeParse({ date_from: instant, date_to: instant }).success).toBe(true);
  });

  it('accepts a range left open at either end', () => {
    expect(trade_query_schema.safeParse({ date_from: '2026-08-18T12:00:00Z' }).success).toBe(true);
    expect(trade_query_schema.safeParse({ date_to: '2026-08-18T09:00:00Z' }).success).toBe(true);
  });

  it('refuses a From later than To on the From field, in words a trader can act on', () => {
    const result = trade_query_schema.safeParse({
      date_from: '2026-08-18T12:00:00Z',
      date_to: '2026-08-18T09:00:00Z',
    });

    expect(result.error?.issues).toEqual([
      expect.objectContaining({ path: ['date_from'], message: 'From must be on or before To' }),
    ]);
  });

  it('does not compare a range when one end is not a timestamp', () => {
    const result = trade_query_schema.safeParse({
      date_from: 'yesterday',
      date_to: '2026-08-18T09:00:00Z',
    });

    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      'Enter a valid date and time',
    ]);
  });

  it('words every refused parameter in plain English', () => {
    const message_for = (query: Record<string, string>): string | undefined =>
      trade_query_schema.safeParse(query).error?.issues[0]?.message;

    expect(message_for({ side: 'LONG' })).toBe('Side must be BUY or SELL');
    expect(message_for({ status: 'AMENDED' })).toBe('Status must be ACTIVE or CANCELLED');
    expect(message_for({ date_from: 'yesterday' })).toBe('Enter a valid date and time');
    expect(message_for({ date_to: 'tomorrow' })).toBe('Enter a valid date and time');
    expect(message_for({ sort_by: 'notional' })).toBe("Sort by one of the blotter's columns");
    expect(message_for({ sort_dir: 'up' })).toBe('Sort direction must be asc or desc');

    for (const limit of ['0', '1001', '2.5', 'ten']) {
      expect(message_for({ limit })).toBe('Page size must be a whole number from 1 to 1,000');
    }
  });
});

describe('trade_list_schema', () => {
  it('carries a cursor rather than an offset, and allows it to be absent', () => {
    const page = {
      data: [valid_trade],
      total: 1,
      limit: 100,
      next_cursor: null,
    };

    expect(trade_list_schema.safeParse(page).success).toBe(true);
    expect(trade_list_schema.safeParse({ ...page, next_cursor: 'abc' }).success).toBe(true);
    expect(trade_list_schema.safeParse({ ...page, next_cursor: undefined }).success).toBe(false);
  });
});
