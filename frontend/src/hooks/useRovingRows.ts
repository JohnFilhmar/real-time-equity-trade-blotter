'use client';

import { useCallback, useRef, useState, type KeyboardEvent } from 'react';

/** What the grid needs to wire row-level keyboard navigation. */
export interface RovingRows {
  /** Index of the row that holds the grid's single tab stop. */
  focused_index: number;

  /** Moves the tab stop, for example when a row is clicked. */
  set_focused_index: (index: number) => void;

  /** Key handler for the grid container. */
  on_key_down: (event: KeyboardEvent<HTMLElement>) => void;

  /** Registers a row element so focus can be moved to it programmatically. */
  register_row: (index: number, element: HTMLElement | null) => void;

  /** Moves DOM focus to a row; used to return focus after a dialog closes. */
  focus_row: (index: number) => void;
}

/** What the grid does in response to the keys the hook does not own. */
export interface RovingRowsHandlers {
  /** Enter on a row. */
  on_activate: (index: number) => void;

  /** Escape on the grid. */
  on_escape: () => void;
}

/**
 * Row-level roving focus for the grid: one tab stop, arrows move it, Home and End jump, Enter
 * opens, Escape closes.
 *
 * The unit of work on a blotter is the trade, and no cell is individually editable, so focus moves
 * by row rather than by cell. The focused index is clamped to the current row count on every
 * read, so focus is never lost to a row that no longer exists.
 *
 * @param row_count - How many rows are rendered in the list.
 * @param handlers - What Enter and Escape do.
 * @returns Wiring for the grid and its rows.
 */
export function useRovingRows(row_count: number, handlers: RovingRowsHandlers): RovingRows {
  const [requestedIndex, setRequestedIndex] = useState(0);
  const elements = useRef<Map<number, HTMLElement>>(new Map());
  const focused_index = row_count === 0 ? 0 : Math.min(requestedIndex, row_count - 1);

  const register_row = useCallback((index: number, element: HTMLElement | null) => {
    if (element === null) {
      elements.current.delete(index);
    } else {
      elements.current.set(index, element);
    }
  }, []);

  const focus_row = useCallback((index: number) => {
    elements.current.get(index)?.focus();
  }, []);

  const move_to = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(index, row_count - 1));
      setRequestedIndex(clamped);
      // The row may not be rendered yet when it is outside the virtual window; the grid scrolls it
      // into view on the next frame and focuses it through register_row.
      window.requestAnimationFrame(() => focus_row(clamped));
    },
    [focus_row, row_count],
  );

  const on_key_down = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (row_count === 0) {
        return;
      }

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          move_to(focused_index + 1);
          break;
        case 'ArrowUp':
          event.preventDefault();
          move_to(focused_index - 1);
          break;
        case 'PageDown':
          event.preventDefault();
          move_to(focused_index + 20);
          break;
        case 'PageUp':
          event.preventDefault();
          move_to(focused_index - 20);
          break;
        case 'Home':
          event.preventDefault();
          move_to(0);
          break;
        case 'End':
          event.preventDefault();
          move_to(row_count - 1);
          break;
        case 'Enter':
          event.preventDefault();
          handlers.on_activate(focused_index);
          break;
        case 'Escape':
          handlers.on_escape();
          break;
        default:
          break;
      }
    },
    [focused_index, handlers, move_to, row_count],
  );

  return { focused_index, set_focused_index: setRequestedIndex, on_key_down, register_row, focus_row };
}
