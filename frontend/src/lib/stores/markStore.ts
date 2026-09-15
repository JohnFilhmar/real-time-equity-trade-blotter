import { create } from 'zustand';
import type { MarkSet } from '@blotter/shared';

/** How many marks per symbol the sparkline keeps. Matches the prototype's trend line. */
export const mark_history_length = 24;

/** The marks as the interface holds them. */
export interface MarkState {
  /** The latest mark per symbol, in the instrument's own currency. Empty until the first tick. */
  marks: MarkSet;

  /** The last marks per symbol, oldest first, for the trend line. */
  history: Readonly<Record<string, readonly number[]>>;

  /** Replaces the mark set and extends every symbol's history. */
  set_marks: (marks: MarkSet) => void;
}

/**
 * The mark store.
 *
 * A store rather than Context because marks tick every 900ms and every price cell, the positions
 * table and the KPI strip subscribe; with Context every consumer would re-render on every tick,
 * with a store only the cells whose symbol moved do.
 */
export const useMarkStore = create<MarkState>()((set) => ({
  marks: {},
  history: {},
  set_marks: (marks) =>
    set((state) => {
      const history: Record<string, readonly number[]> = { ...state.history };
      for (const [symbol, mark] of Object.entries(marks)) {
        const previous = history[symbol] ?? [];
        history[symbol] = [...previous, mark].slice(-mark_history_length);
      }
      return { marks, history };
    }),
}));
