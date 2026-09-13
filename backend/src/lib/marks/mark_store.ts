import { instruments, type MarkSet } from '@blotter/shared';

/** The current mark for every symbol, held in process memory. */
export interface MarkStore {
  /** Reads the whole set. A copy, so a caller cannot move a mark without going through `set`. */
  current(): MarkSet;

  /**
   * Replaces the whole set.
   *
   * @param marks - The new mark for every symbol.
   */
  set(marks: MarkSet): void;
}

/**
 * Builds the mark store, seeded from each instrument's reference price.
 *
 * Nothing is persisted: marks are transient market data, so a restart re-seeds from the reference
 * price rather than reading back a table nobody else would use. The socket server reads this on
 * every connection so a fresh client has marks before the first tick.
 *
 * @returns A store holding one mark per symbol in the universe.
 */
export function create_mark_store(): MarkStore {
  let marks: MarkSet = Object.fromEntries(
    instruments.map((instrument) => [instrument.symbol, instrument.base_price]),
  );

  return {
    current(): MarkSet {
      return { ...marks };
    },

    set(next: MarkSet): void {
      marks = { ...next };
    },
  };
}
