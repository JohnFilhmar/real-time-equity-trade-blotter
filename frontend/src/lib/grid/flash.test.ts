import { describe, expect, it } from 'vitest';
import { flash_for, flash_throttle_ms, is_flash_throttled } from './flash';

describe('flash_for', () => {
  it('flashes a row it has not seen before as new', () => {
    expect(flash_for(undefined, { version: 1, price: 10 })).toBe('new');
  });

  it('does not flash a row whose version did not move', () => {
    expect(flash_for({ version: 2, price: 10 }, { version: 2, price: 11 })).toBeNull();
  });

  it('does not flash a stale row that arrived after a newer one', () => {
    expect(flash_for({ version: 3, price: 10 }, { version: 2, price: 12 })).toBeNull();
  });

  it('flashes up when a new version raised the price', () => {
    expect(flash_for({ version: 1, price: 10 }, { version: 2, price: 10.5 })).toBe('up');
  });

  it('flashes down when a new version lowered the price', () => {
    expect(flash_for({ version: 1, price: 10 }, { version: 2, price: 9.5 })).toBe('down');
  });

  it('flashes changed when a new version left the price alone', () => {
    expect(flash_for({ version: 1, price: 10 }, { version: 2, price: 10 })).toBe('changed');
  });
});

describe('is_flash_throttled', () => {
  const started_at = 10_000;

  it('never throttles a row that has not flashed yet', () => {
    expect(is_flash_throttled(undefined, started_at)).toBe(false);
  });

  it('throttles a second flash inside the window', () => {
    expect(is_flash_throttled(started_at, started_at + flash_throttle_ms - 1)).toBe(true);
  });

  it('allows a flash once the window has passed', () => {
    expect(is_flash_throttled(started_at, started_at + flash_throttle_ms)).toBe(false);
  });
});
