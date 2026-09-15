import { describe, expect, it } from 'vitest';
import {
  active_filter_count,
  default_trade_list_query,
  parse_search_params,
  to_search_params,
  trade_list_query_schema,
} from './tradeQuery';

const nine = '2026-08-18T09:00:00.000Z';
const noon = '2026-08-18T12:00:00.000Z';

describe('trade_list_query_schema', () => {
  it('is the API query without its page window', () => {
    expect(trade_list_query_schema.parse({ symbol: 'AAPL', limit: '50', cursor: 'abc' })).toEqual({
      ...default_trade_list_query,
      symbol: 'AAPL',
    });
  });

  it('refuses a reversed range the way the API does', () => {
    const result = trade_list_query_schema.safeParse({ date_from: noon, date_to: nine });

    expect(result.error?.issues).toEqual([
      expect.objectContaining({ path: ['date_from'], message: 'From must be on or before To' }),
    ]);
  });
});

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

  it('drops a From later than To, keeping the To and every other filter', () => {
    const query = parse_search_params(new URLSearchParams(`symbol=AAPL&date_from=${noon}&date_to=${nine}`));
    expect(query.date_from).toBeUndefined();
    expect(query.date_to).toBe(nine);
    expect(query.symbol).toBe('AAPL');
  });

  it('keeps dropping when removing one bad key uncovers a reversed range', () => {
    const query = parse_search_params(new URLSearchParams(`side=LONG&date_from=${noon}&date_to=${nine}`));
    expect(query.side).toBeUndefined();
    expect(query.date_from).toBeUndefined();
    expect(query.date_to).toBe(nine);
  });

  it('keeps a range whose ends are the same instant', () => {
    const query = parse_search_params(new URLSearchParams(`date_from=${nine}&date_to=${nine}`));
    expect(query.date_from).toBe(nine);
    expect(query.date_to).toBe(nine);
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
