/** What a row flash means: a new arrival, a price that moved up or down, or another change. */
export type FlashKind = 'new' | 'up' | 'down' | 'changed';

/** The two fields a flash decision reads from a row. */
export interface FlashSnapshot {
  version: number;
  price: number;
}

/** A row may not begin a new flash within this many milliseconds of its last one. WCAG 2.3.1. */
export const flash_throttle_ms = 333;

/** How long a flash animation runs before the attribute is removed. */
export const flash_duration_ms = 1200;

/**
 * Decides what flash a changed row deserves.
 *
 * @param previous - The row as last seen, or `undefined` when it is new.
 * @param next - The row now.
 * @returns The flash kind, or `null` when nothing visible changed, which includes a stale version
 * that arrived after a newer one.
 */
export function flash_for(previous: FlashSnapshot | undefined, next: FlashSnapshot): FlashKind | null {
  if (previous === undefined) {
    return 'new';
  }
  if (next.version <= previous.version) {
    return null;
  }
  if (next.price > previous.price) {
    return 'up';
  }
  if (next.price < previous.price) {
    return 'down';
  }
  return 'changed';
}

/**
 * Whether a row is still inside the throttle window of its last flash.
 *
 * @param last_flash_at - When the row last started a flash, in milliseconds on the caller's clock,
 * or `undefined` when it never has.
 * @param now - The current time on the same clock.
 * @returns True when a new flash would start within `flash_throttle_ms` of the last one.
 */
export function is_flash_throttled(last_flash_at: number | undefined, now: number): boolean {
  return last_flash_at !== undefined && now - last_flash_at < flash_throttle_ms;
}
