import type { Trade } from '@blotter/shared';
import { compare_on } from './filtering.js';

/**
 * Picks one trade at random from the newest few by execution time.
 *
 * Orders the way the blotter's default view does, newest `tradeTimestamp` first with the higher row
 * id breaking a tie, so "the newest thirty" are the thirty rows at the top of the grid.
 *
 * @param active - The active trades to choose among, in any order. Not modified.
 * @param newest - How many of the newest trades to choose among. Below one chooses nothing, and a
 * book smaller than this makes every trade a candidate.
 * @returns A trade, or `null` when there is nothing to choose.
 */
export function pick_random_recent(active: readonly Trade[], newest: number): Trade | null {
  if (newest < 1 || active.length === 0) {
    return null;
  }

  const recent = [...active].sort((a, b) => compare_on(b, a, 'tradeTimestamp')).slice(0, newest);
  return recent[Math.floor(Math.random() * recent.length)] ?? null;
}
