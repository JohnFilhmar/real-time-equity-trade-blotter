import { describe, expect, it } from 'vitest';
import { is_next_in_sequence, order_by_seq } from './sequence';

describe('is_next_in_sequence', () => {
  it('accepts any number as the first broadcast after a resync', () => {
    expect(is_next_in_sequence(null, 4_812)).toBe(true);
  });

  it('accepts the number that follows the last one seen', () => {
    expect(is_next_in_sequence(41, 42)).toBe(true);
  });

  it('reports a gap when a number was skipped', () => {
    expect(is_next_in_sequence(41, 43)).toBe(false);
  });

  it('reports a gap when the counter went backwards, as after a server restart', () => {
    expect(is_next_in_sequence(41, 1)).toBe(false);
  });

  it('reports a gap on a repeat of the last number', () => {
    expect(is_next_in_sequence(41, 41)).toBe(false);
  });
});

describe('order_by_seq', () => {
  it("applies a frame's broadcasts in sequence order however they arrived", () => {
    const batch = [{ envelope: { seq: 3 } }, { envelope: { seq: 1 } }, { envelope: { seq: 2 } }];
    expect(order_by_seq(batch).map((item) => item.envelope.seq)).toEqual([1, 2, 3]);
  });

  it('leaves an empty frame empty', () => {
    expect(order_by_seq([])).toEqual([]);
  });
});
