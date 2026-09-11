import { describe, expect, it } from 'vitest';
import { trade_schema } from '@blotter/shared';
import { to_wire_trade, type TradeRow } from './trade_mapper.js';

/** A row shaped the way the database returns one, with a Decimal-like price. */
const a_row: TradeRow = {
  id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  tradeId: 'TRD-100001',
  symbol: 'AAPL',
  side: 'BUY',
  quantity: 5000,
  price: { toNumber: () => 227.45 },
  trader: 'JSMITH',
  book: 'EQUITIES_UK',
  counterparty: 'Goldman Sachs',
  tradeTimestamp: new Date('2026-08-18T09:15:23.000Z'),
  status: 'ACTIVE',
  version: 1,
  createdAt: new Date('2026-08-18T09:15:24.000Z'),
  updatedAt: new Date('2026-08-18T09:15:24.000Z'),
};

describe('to_wire_trade', () => {
  it('produces a trade that satisfies the shared contract', () => {
    expect(() => trade_schema.parse(to_wire_trade(a_row))).not.toThrow();
  });

  it('turns the Decimal price into a JSON number', () => {
    const trade = to_wire_trade(a_row);

    expect(typeof trade.price).toBe('number');
    expect(trade.price).toBe(227.45);
  });

  it('survives JSON serialisation without losing the price', () => {
    const serialised = JSON.parse(JSON.stringify(to_wire_trade(a_row)));

    expect(serialised.price).toBe(227.45);
  });

  it('renders every timestamp as an ISO string', () => {
    const trade = to_wire_trade(a_row);

    expect(trade.tradeTimestamp).toBe('2026-08-18T09:15:23.000Z');
    expect(trade.createdAt).toBe('2026-08-18T09:15:24.000Z');
    expect(trade.updatedAt).toBe('2026-08-18T09:15:24.000Z');
  });
});
