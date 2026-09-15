import { describe, expect, it } from 'vitest';
import { format_lockout, seconds_until } from './lockout';

describe('seconds_until', () => {
  it('counts whole seconds to the expiry, rounding a part second up', () => {
    expect(seconds_until(10_000, 8_500)).toBe(2);
    expect(seconds_until(900_000, 0)).toBe(900);
  });

  it('is zero at the expiry and after it', () => {
    expect(seconds_until(10_000, 10_000)).toBe(0);
    expect(seconds_until(10_000, 12_000)).toBe(0);
  });
});

describe('format_lockout', () => {
  it('shows minutes and zero-padded seconds', () => {
    expect(format_lockout(900)).toBe('15:00');
    expect(format_lockout(59)).toBe('0:59');
    expect(format_lockout(61)).toBe('1:01');
  });

  it('never goes below zero', () => {
    expect(format_lockout(-4)).toBe('0:00');
  });
});
