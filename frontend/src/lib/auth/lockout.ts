/**
 * Counts the whole seconds left on a lock, rounding a part second up so the countdown never shows
 * `0:00` while the lock still holds.
 *
 * @param expires_at - When the lock ends, in epoch milliseconds.
 * @param now - The current time, in epoch milliseconds.
 * @returns Seconds remaining. Zero at the expiry and after it.
 */
export function seconds_until(expires_at: number, now: number): number {
  return Math.max(0, Math.ceil((expires_at - now) / 1000));
}

/**
 * Formats a countdown as minutes and zero-padded seconds, `15:00` or `0:59`.
 *
 * @param seconds - Seconds remaining; anything below zero shows as `0:00`.
 * @returns The countdown text.
 */
export function format_lockout(seconds: number): string {
  const clamped = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(clamped / 60);
  const rest = clamped % 60;
  return `${minutes.toString()}:${rest.toString().padStart(2, '0')}`;
}
