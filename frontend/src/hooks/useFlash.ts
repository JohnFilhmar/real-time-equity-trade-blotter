'use client';

import { useEffect, useRef, useState } from 'react';
import type { Trade } from '@blotter/shared';
import { changed_cells, flash_duration_ms, is_flash_throttled, type CellFlash, type RowCellFlashes } from '@/lib/grid/flash';

/** What the grid is flashing right now. */
export interface GridFlashes {
  /** Rows that arrived since the baseline, which show the row-level insert flash. */
  inserted: ReadonlySet<string>;
  /** The flashing cells of each amended row, keyed by row id. A row with nothing flashing has no entry. */
  cells: ReadonlyMap<string, RowCellFlashes>;
}

/** The rows last compared, and the list they belonged to. */
interface Snapshot {
  key: string | null;
  rows: ReadonlyMap<string, Trade>;
}

/** Flashes found by the comparison, waiting for the next animation frame. */
interface Queued {
  inserted: string[];
  cells: Array<{ row_id: string; column: string; flash: CellFlash }>;
}

/** Handles the hook must cancel when the grid unmounts. */
interface Handles {
  frame: number | null;
  timers: Map<string, ReturnType<typeof setTimeout>>;
}

const no_flashes: GridFlashes = { inserted: new Set(), cells: new Map() };

/**
 * Adds a batch of flashes, copying only the rows it touches so every other row keeps its reference.
 *
 * @param current - The flashes showing now.
 * @param batch - The flashes to start.
 * @returns The flashes with the batch applied.
 */
function start_flashes(current: GridFlashes, batch: Queued): GridFlashes {
  const inserted = batch.inserted.length === 0 ? current.inserted : new Set([...current.inserted, ...batch.inserted]);
  const cells = new Map(current.cells);

  for (const { row_id, column, flash } of batch.cells) {
    cells.set(row_id, new Map(cells.get(row_id) ?? []).set(column, flash));
  }

  return { inserted, cells };
}

/**
 * Removes one row's insert flash.
 *
 * @param current - The flashes showing now.
 * @param row_id - The row whose flash ended.
 * @returns The flashes without it, or `current` when it was already gone.
 */
function end_insert(current: GridFlashes, row_id: string): GridFlashes {
  if (!current.inserted.has(row_id)) {
    return current;
  }
  const inserted = new Set(current.inserted);
  inserted.delete(row_id);
  return { inserted, cells: current.cells };
}

/**
 * Removes one cell's flash, and the row's entry once none of its cells flash.
 *
 * @param current - The flashes showing now.
 * @param row_id - The row the cell belongs to.
 * @param column - The cell's column id.
 * @returns The flashes without it, or `current` when it was already gone.
 */
function end_cell(current: GridFlashes, row_id: string, column: string): GridFlashes {
  const row = current.cells.get(row_id);
  if (row === undefined || !row.has(column)) {
    return current;
  }

  const cells = new Map(current.cells);
  const remaining = new Map(row);
  remaining.delete(column);
  if (remaining.size === 0) {
    cells.delete(row_id);
  } else {
    cells.set(row_id, remaining);
  }
  return { inserted: current.inserted, cells };
}

/**
 * Tracks which rows arrived and which cells an amendment changed since the last render.
 *
 * Two controls work together. The caller already coalesces broadcasts to one render per frame,
 * which bounds the render rate. This hook adds the per-cell throttle: a cell that changed again
 * within 333ms of its last flash does not start another, which is the control that satisfies
 * WCAG 2.3.1 on a busy feed. Rows seen first under a baseline key never flash, so neither a page
 * load nor a re-sorted page lights up every row. Flashes start on the next animation frame, so a
 * comparison never sets state from inside the effect that made it.
 *
 * @param rows - The rows currently in the list, in order.
 * @param baseline_key - Names the list the rows belong to, or `null` while rows from the previous
 * list stand in as a placeholder. Nothing flashes under `null`, and the first rows under a new key
 * are the baseline later changes are measured against.
 * @returns The inserted rows and the flashing cells.
 */
export function useFlash(rows: readonly Trade[], baseline_key: string | null): GridFlashes {
  const snapshot = useRef<Snapshot | null>(null);
  const last_flash_at = useRef<Map<string, number>>(new Map());
  const queued = useRef<Queued>({ inserted: [], cells: [] });
  const handles = useRef<Handles>({ frame: null, timers: new Map() });
  const [flashes, setFlashes] = useState<GridFlashes>(no_flashes);

  useEffect(() => {
    const previous = snapshot.current;
    snapshot.current = { key: baseline_key, rows: new Map(rows.map((row) => [row.id, row])) };

    if (previous === null || baseline_key === null || previous.key !== baseline_key) {
      return;
    }

    const now = Date.now();
    const pending = queued.current;

    for (const row of rows) {
      const before = previous.rows.get(row.id);
      if (before === undefined) {
        pending.inserted.push(row.id);
        continue;
      }
      for (const [column, kind] of changed_cells(before, row)) {
        const key = `${row.id}:${column}`;
        if (is_flash_throttled(last_flash_at.current.get(key), now)) {
          continue;
        }
        last_flash_at.current.set(key, now);
        pending.cells.push({ row_id: row.id, column, flash: { kind, version: row.version } });
      }
    }

    const current = handles.current;
    if (current.frame !== null || (pending.inserted.length === 0 && pending.cells.length === 0)) {
      return;
    }

    // Anything found before the frame runs joins the same batch, so a second render inside one
    // frame cannot drop flashes the first one already throttled.
    current.frame = window.requestAnimationFrame(() => {
      current.frame = null;
      const batch = queued.current;
      queued.current = { inserted: [], cells: [] };
      setFlashes((showing) => start_flashes(showing, batch));

      const restart = (key: string, end: () => void): void => {
        const existing = current.timers.get(key);
        if (existing !== undefined) {
          clearTimeout(existing);
        }
        current.timers.set(
          key,
          setTimeout(() => {
            current.timers.delete(key);
            end();
          }, flash_duration_ms),
        );
      };

      for (const row_id of batch.inserted) {
        restart(`row:${row_id}`, () => setFlashes((showing) => end_insert(showing, row_id)));
      }
      for (const { row_id, column } of batch.cells) {
        const key = `${row_id}:${column}`;
        restart(key, () => {
          last_flash_at.current.delete(key);
          setFlashes((showing) => end_cell(showing, row_id, column));
        });
      }
    });
  }, [rows, baseline_key]);

  useEffect(() => {
    const current = handles.current;
    return () => {
      if (current.frame !== null) {
        window.cancelAnimationFrame(current.frame);
      }
      for (const timer of current.timers.values()) {
        clearTimeout(timer);
      }
    };
  }, []);

  return flashes;
}
