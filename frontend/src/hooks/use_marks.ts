'use client';

import { useMarkStore } from '@/lib/stores/mark_store';

/**
 * Reads one symbol's current mark. Re-renders only when that symbol's mark changes.
 *
 * @param symbol - The instrument.
 * @returns The mark in the instrument's own currency, or `undefined` before the first tick.
 */
export function useMark(symbol: string): number | undefined {
  return useMarkStore((state) => state.marks[symbol]);
}

/**
 * Reads one symbol's recent marks for a trend line.
 *
 * @param symbol - The instrument.
 * @returns Marks oldest first, empty before the first tick.
 */
export function useMarkHistory(symbol: string): readonly number[] {
  return useMarkStore((state) => state.history[symbol] ?? empty);
}

/**
 * Reads the whole mark set. Use for aggregates; cells should use {@link useMark}.
 *
 * @returns Every current mark keyed by symbol.
 */
export function useMarks(): Readonly<Record<string, number>> {
  return useMarkStore((state) => state.marks);
}

const empty: readonly number[] = [];
