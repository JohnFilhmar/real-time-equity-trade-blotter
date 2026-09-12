import { describe, expect, it } from 'vitest';
import {
  format_money,
  format_notional,
  format_price,
  format_quantity,
  to_display_notional,
} from './money';

describe('format_quantity', () => {
  it('separates thousands', () => {
    expect(format_quantity(5000)).toBe('5,000');
    expect(format_quantity(800)).toBe('800');
  });
});

describe('format_price', () => {
  it('keeps two decimals for dollars and pence alike', () => {
    expect(format_price(227.45)).toBe('227.45');
    expect(format_price(2814)).toBe('2,814.00');
    expect(format_price(78.5)).toBe('78.50');
  });
});

describe('to_display_notional', () => {
  it('turns pence into pounds and leaves dollars alone', () => {
    expect(to_display_notional(14_070_000, 'GBX')).toBe(140_700);
    expect(to_display_notional(1_137_250, 'USD')).toBe(1_137_250);
  });
});

describe('format_money', () => {
  it('abbreviates millions with the currency symbol', () => {
    expect(format_money(1_137_250, 'USD')).toBe('$1.14M');
    expect(format_money(2_500_000, 'GBX')).toBe('£2.50M');
  });

  it('prints thousands in full and small amounts with two decimals', () => {
    expect(format_money(140_700, 'GBX')).toBe('£140,700');
    expect(format_money(981.5, 'USD')).toBe('$981.50');
  });

  it('marks negatives with a minus sign rather than parentheses', () => {
    expect(format_money(-140_700, 'GBX')).toBe('−£140,700');
  });
});

describe('format_notional', () => {
  it('combines quantity, price and the pence conversion', () => {
    expect(format_notional(5000, 2814, 'GBX')).toBe('£140,700');
    expect(format_notional(5000, 227.45, 'USD')).toBe('$1.14M');
  });
});
