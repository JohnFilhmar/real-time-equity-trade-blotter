/** Something the simulated desk can do on a tick. */
export type FeedAction = 'create' | 'amend' | 'cancel';

/** Share of the cap at which bookings start turning into cancels. */
const band_start = 0.9;

/**
 * The highest chance that a booking turns into a cancel. Kept below one, so a book at or over its
 * cap still books one ticket in seven of those it draws, and the grid never goes quiet.
 */
const max_conversion = 6 / 7;

/**
 * The chance that a booking becomes a cancel, for a book of a given size.
 *
 * Zero until the book reaches ninety per cent of the cap, rising in a straight line to six in seven
 * at the cap, and staying there above it. Rising across a band rather than switching at the cap
 * keeps the book from sawing up and down on the threshold, and a book far over the cap drains while
 * still booking.
 *
 * @param active - Active trades now.
 * @param cap - The size the desk keeps its book near.
 * @returns A probability between 0 and 6/7.
 */
export function conversion_chance(active: number, cap: number): number {
  const start = cap * band_start;

  if (active <= start) {
    return 0;
  }

  if (active >= cap) {
    return max_conversion;
  }

  return (max_conversion * (active - start)) / (cap - start);
}

/**
 * Decides what the desk does this tick, given what it drew and how large its book is.
 *
 * @param drawn - The action drawn from the desk's usual mix.
 * @param active - Active trades now. Only matters when the draw is a booking.
 * @param cap - The size the desk keeps its book near.
 * @param roll - A uniform draw between 0 and 1.
 * @returns The drawn action, except a booking that the roll turns into a cancel.
 */
export function choose_action(drawn: FeedAction, active: number, cap: number, roll: number): FeedAction {
  return drawn === 'create' && roll < conversion_chance(active, cap) ? 'cancel' : drawn;
}
