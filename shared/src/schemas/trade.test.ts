import { describe, expect, it } from 'vitest';
import {
  amend_trade_schema,
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

  it('permits the fields a desk genuinely corrects', () => {
    const result = amend_trade_schema.safeParse({
      version: 1,
      quantity: 100,
      price: 1.5,
      counterparty: 'Nomura',
      book: 'EQUITIES_UK',
    });

    expect(result.success).toBe(true);
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
