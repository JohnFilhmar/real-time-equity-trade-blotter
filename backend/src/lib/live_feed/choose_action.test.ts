import { describe, expect, it } from 'vitest';
import { choose_action, conversion_chance } from './choose_action.js';

const cap = 2000;

describe('conversion_chance', () => {
  it('is zero until the book reaches ninety per cent of its cap', () => {
    expect(conversion_chance(0, cap)).toBe(0);
    expect(conversion_chance(1800, cap)).toBe(0);
  });

  it('rises across the last tenth of the cap', () => {
    expect(conversion_chance(1900, cap)).toBeCloseTo(3 / 7);
  });

  it('stops at six in seven at or over the cap, so the desk still books', () => {
    expect(conversion_chance(2000, cap)).toBeCloseTo(6 / 7);
    expect(conversion_chance(22_466, cap)).toBeCloseTo(6 / 7);
  });
});

describe('choose_action', () => {
  it('leaves amends and cancels alone', () => {
    expect(choose_action('amend', 50_000, cap, 0)).toBe('amend');
    expect(choose_action('cancel', 0, cap, 0.99)).toBe('cancel');
  });

  it('books below the band whatever the roll', () => {
    expect(choose_action('create', 1500, cap, 0)).toBe('create');
  });

  it('turns a booking into a cancel when the roll falls under the chance', () => {
    expect(choose_action('create', 2000, cap, 0.8)).toBe('cancel');
    expect(choose_action('create', 1900, cap, 0.4)).toBe('cancel');
  });

  it('still books over the cap when the roll clears the chance', () => {
    expect(choose_action('create', 22_466, cap, 0.9)).toBe('create');
    expect(choose_action('create', 1900, cap, 0.45)).toBe('create');
  });
});
