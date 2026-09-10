import { describe, expect, it } from 'vitest';
import {
  amend_trade_schema,
  create_trade_schema,
  trade_query_schema,
  trade_schema,
} from './trade.js';

const valid_trade = {
  id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  tradeId: 'TRD-100001',
  symbol: 'AAPL',
  side: 'BUY',
  quantity: 5000,
  price: 227.45,
  trader: 'JSMITH',
  book: 'EQUITIES_UK',
  counterparty: 'Goldman Sachs',
  tradeTimestamp: '2026-08-18T09:15:23Z',
  status: 'ACTIVE',
  version: 1,
  createdAt: '2026-08-18T09:15:23Z',
  updatedAt: '2026-08-18T09:15:23Z',
};

describe('trade_schema', () => {
  it('accepts the payload shape the brief supplies', () => {
    expect(trade_schema.safeParse(valid_trade).success).toBe(true);
  });

  it.each([
    ['quantity', 0],
    ['quantity', -100],
    ['price', 0],
    ['price', -1],
  ])('rejects a non-positive %s of %s', (field, value) => {
    const result = trade_schema.safeParse({ ...valid_trade, [field]: value });

    expect(result.success).toBe(false);
  });

  it('rejects a fractional quantity, since shares are not divisible here', () => {
    expect(trade_schema.safeParse({ ...valid_trade, quantity: 10.5 }).success).toBe(false);
  });

  it('rejects an empty trader', () => {
    expect(trade_schema.safeParse({ ...valid_trade, trader: '   ' }).success).toBe(false);
  });

  it('rejects a lower-case symbol', () => {
    expect(trade_schema.safeParse({ ...valid_trade, symbol: 'aapl' }).success).toBe(false);
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
    const keys = Object.keys(create_trade_schema.shape);

    expect(keys).not.toContain('id');
    expect(keys).not.toContain('tradeId');
    expect(keys).not.toContain('status');
    expect(keys).not.toContain('version');
    expect(keys).not.toContain('createdAt');
  });

  it('still requires the fields a trade cannot exist without', () => {
    expect(create_trade_schema.safeParse({ symbol: 'AAPL' }).success).toBe(false);
  });

  it('inherits validation from the canonical schema rather than restating it', () => {
    const result = create_trade_schema.safeParse({
      symbol: 'AAPL',
      side: 'BUY',
      quantity: -1,
      price: 227.45,
      trader: 'JSMITH',
      book: 'EQUITIES_UK',
      counterparty: 'Goldman Sachs',
      tradeTimestamp: '2026-08-18T09:15:23Z',
    });

    expect(result.success).toBe(false);
  });
});

describe('amend_trade_schema', () => {
  it('allows a partial update but insists on the version being echoed back', () => {
    expect(amend_trade_schema.safeParse({ quantity: 6000, version: 1 }).success).toBe(true);
    expect(amend_trade_schema.safeParse({ quantity: 6000 }).success).toBe(false);
  });
});

describe('trade_query_schema', () => {
  it('defaults to the newest trades first', () => {
    const result = trade_query_schema.parse({});

    expect(result.sort_by).toBe('tradeTimestamp');
    expect(result.sort_dir).toBe('desc');
    expect(result.limit).toBe(100);
  });

  it('coerces numeric query strings, which arrive as text', () => {
    const result = trade_query_schema.parse({ limit: '25', offset: '50' });

    expect(result.limit).toBe(25);
    expect(result.offset).toBe(50);
  });

  it('caps the page size so one request cannot pull the whole table', () => {
    expect(trade_query_schema.safeParse({ limit: '5000' }).success).toBe(false);
  });
});
