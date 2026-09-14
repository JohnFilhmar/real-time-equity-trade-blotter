import { describe, expect, it } from 'vitest';
import { format_lockout, lockout_seconds_from_detail } from './lockout';

describe('lockout_seconds_from_detail', () => {
  it('reads the seconds out of the lockout sentence the API sends', () => {
    expect(lockout_seconds_from_detail('Too many failed attempts. Try again in 900 seconds.')).toBe(900);
  });

  it('returns null for any other problem detail', () => {
    expect(lockout_seconds_from_detail('Invalid username or password.')).toBeNull();
    expect(lockout_seconds_from_detail('Too many requests from this address.')).toBeNull();
  });

  it('returns null when the number is not a whole positive count', () => {
    expect(lockout_seconds_from_detail('Try again in 0 seconds.')).toBeNull();
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
