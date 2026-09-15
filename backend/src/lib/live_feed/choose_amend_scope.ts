/** Where a simulated amendment looks for its target: among the newest trades, or anywhere in the book. */
export type AmendScope = 'recent' | 'any';

/**
 * How many of the newest active trades, by execution time, count as recent.
 *
 * Thirty is about what the blotter shows on one screen in its default newest-first view. With a
 * book of thousands, a uniformly chosen amendment reaches that screen roughly once an hour, so a
 * trader watching the grid would almost never see one land.
 */
export const recent_amend_window = 30;

/** The share of simulated amendments that target a recent trade. The rest pick from the whole active book. */
export const recent_amend_share = 0.5;

/**
 * Decides where one simulated amendment looks for its target.
 *
 * @param roll - A uniform draw between 0 and 1.
 * @returns `recent` when the roll falls below `recent_amend_share`, otherwise `any`.
 */
export function choose_amend_scope(roll: number): AmendScope {
  return roll < recent_amend_share ? 'recent' : 'any';
}
