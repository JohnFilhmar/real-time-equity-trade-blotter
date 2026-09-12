import { describe, expect, it } from 'vitest';
import {
  active_filter_count,
  default_trade_list_query,
  parse_search_params,
  to_search_params,
} from './trade_query';

describe('parse_search_params', () => {
  it('defaults to newest first with no filters', () => {
    expect(parse_search_params(new URLSearchParams(''))).toEqual(default_trade_list_query);
    expect(default_trade_list_query.sort_by).toBe('tradeTimestamp');
    expect(default_trade_list_query.sort_dir).toBe('desc');
  });

  it('reads every filter and the sort', () => {
    const query = parse_search_params(
      new URLSearchParams('symbol=AAPL&side=BUY&status=ACTIVE&sort_by=quantity&sort_dir=asc'),
    );
    expect(query.symbol).toBe('AAPL');
    expect(query.side).toBe('BUY');
    expect(query.status).toBe('ACTIVE');
    expect(query.sort_by).toBe('quantity');
    expect(query.sort_dir).toBe('asc');
  });

  it('drops a malformed key and keeps the rest', () => {
    const query = parse_search_params(new URLSearchParams('side=LONG&symbol=MSFT&sort_by=nope'));
    expect(query.side).toBeUndefined();
    expect(query.symbol).toBe('MSFT');
    expect(query.sort_by).toBe('tradeTimestamp');
  });
});

describe('to_search_params', () => {
  it('omits defaults and empty values', () => {
    expect(to_search_params(default_trade_list_query).toString()).toBe('');
    expect(
      to_search_params({ ...default_trade_list_query, symbol: 'AAPL', sort_dir: 'asc' }).toString(),
    ).toBe('symbol=AAPL&sort_dir=asc');
  });

  it('round-trips through parse', () => {
    const query = { ...default_trade_list_query, trader: 'JSMITH', date_from: '2026-08-18T00:00:00.000Z' };
    expect(parse_search_params(to_search_params(query))).toEqual(query);
  });
});

describe('active_filter_count', () => {
  it('counts filters, not sort', () => {
    expect(active_filter_count(default_trade_list_query)).toBe(0);
    expect(active_filter_count({ ...default_trade_list_query, side: 'SELL', book: 'EQ', sort_dir: 'asc' })).toBe(2);
  });
});
