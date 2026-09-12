'use client';

import { useEffect, useRef, useState } from 'react';
import type { Trade } from '@blotter/shared';

/** What a row flash means: a new arrival, or a price that moved up or down. */
export type FlashKind = 'new' | 'up' | 'down' | 'changed';

/** A row may not begin a new flash within this many milliseconds of its last one. WCAG 2.3.1. */
export const flash_throttle_ms = 333;

/** How long a flash animation runs before the attribute is removed. */
export const flash_duration_ms = 1200;

interface Snapshot {
  version: number;
  price: number;
}

/**
 * Decides what flash a changed row deserves.
 *
 * @param previous - The row as last seen, or `undefined` when it is new.
 * @param next - The row now.
 * @returns The flash kind, or `null` when nothing visible changed.
 */
function flash_for(previous: Snapshot | undefined, next: Trade): FlashKind | null {
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
 * Tracks which rows changed since the last render and what flash each should show.
 *
 * Two controls work together. The caller already coalesces broadcasts to one render per frame,
 * which bounds the render rate. This hook adds the per-row throttle: a row that changed again
 * within 333ms of its last flash does not start another, which is the control that satisfies
 * WCAG 2.3.1 on a busy feed. The first render never flashes, so a page load does not light up
 * every row. Flashes are applied on the next animation frame, so a diff never triggers a render
 * from inside the effect that computed it.
 *
 * @param rows - The rows currently in the list, in order.
 * @returns A map from row id to the flash it should show right now.
 */
export function useFlash(rows: readonly Trade[]): ReadonlyMap<string, FlashKind> {
  const snapshots = useRef<Map<string, Snapshot> | null>(null);
  const last_flash_at = useRef<Map<string, number>>(new Map());
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [flashes, set_flashes] = useState<ReadonlyMap<string, FlashKind>>(new Map());

  useEffect(() => {
    const next_snapshots = new Map<string, Snapshot>();
    for (const row of rows) {
      next_snapshots.set(row.id, { version: row.version, price: row.price });
    }

    const previous = snapshots.current;
    snapshots.current = next_snapshots;

    if (previous === null) {
      return;
    }

    const now = Date.now();
    const started: Array<[string, FlashKind]> = [];

    for (const row of rows) {
      const kind = flash_for(previous.get(row.id), row);
      if (kind === null) {
        continue;
      }
      const last = last_flash_at.current.get(row.id) ?? 0;
      if (now - last < flash_throttle_ms) {
        continue;
      }
      last_flash_at.current.set(row.id, now);
      started.push([row.id, kind]);
    }

    if (started.length === 0) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      set_flashes((current) => {
        const next = new Map(current);
        for (const [id, kind] of started) {
          next.set(id, kind);
        }
        return next;
      });

      for (const [id] of started) {
        const existing = timers.current.get(id);
        if (existing !== undefined) {
          clearTimeout(existing);
        }
        timers.current.set(
          id,
          setTimeout(() => {
            timers.current.delete(id);
            set_flashes((current) => {
              if (!current.has(id)) {
                return current;
              }
              const next = new Map(current);
              next.delete(id);
              return next;
            });
          }, flash_duration_ms),
        );
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [rows]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) {
        clearTimeout(timer);
      }
    };
  }, []);

  return flashes;
}
