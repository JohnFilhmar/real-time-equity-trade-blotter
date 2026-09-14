const lockout_sentence = /try again in (\d+) seconds/i;

/**
 * Reads the lockout duration out of the API's problem detail, when the detail is a lockout.
 *
 * The API says "Too many failed attempts. Try again in 900 seconds." and carries the number
 * nowhere else, so that sentence is the contract this reads; a `Retry-After` header would be the
 * cleaner one and is the change to make if the sentence ever needs to move.
 *
 * @param detail - The problem detail as returned.
 * @returns Whole seconds remaining, or `null` when the detail is not a lockout.
 */
export function lockout_seconds_from_detail(detail: string): number | null {
  const match = lockout_sentence.exec(detail);
  if (match === null) {
    return null;
  }
  const seconds = Number(match[1]);
  return Number.isInteger(seconds) && seconds > 0 ? seconds : null;
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
