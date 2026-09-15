'use client';

import { useCallback, useLayoutEffect, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';

/** What the grid needs to wire row-level keyboard navigation. */
export interface RovingRows {
  /** Id of the row holding the grid's single tab stop, or `null` when there are no rows. */
  focused_id: string | null;

  /** Position of that row in the list, or -1 when there are no rows. */
  focused_index: number;

  /** Moves the tab stop to a row without moving DOM focus, for example when the row is clicked. */
  set_focused_id: (id: string) => void;

  /** Key handler for the grid container. Acts only on keys pressed while a row holds focus. */
  on_key_down: (event: KeyboardEvent<HTMLElement>) => void;

  /** Focus handler for the grid container. A row that receives focus takes the tab stop. */
  on_focus: (event: FocusEvent<HTMLElement>) => void;

  /** Blur handler for the grid container. Forgets the focused row once focus moves outside the grid. */
  on_blur: (event: FocusEvent<HTMLElement>) => void;

  /** Registers a rendered row under its id, focusing it when a jump is waiting for it to render. */
  register_row: (id: string, element: HTMLElement | null) => void;

  /** Moves DOM focus to the tab-stop row, bringing it into the rendered window first. */
  focus_current: () => void;
}

/** What the grid does when the hook moves or acts on a row. */
export interface RovingRowsHandlers {
  /** A key moved the tab stop to another row. */
  on_move: (id: string) => void;

  /** Enter on a row. */
  on_activate: (id: string) => void;

  /** Escape on a row. */
  on_escape: () => void;

  /** Brings the row at an index into the rendered window. The hook focuses it once it registers. */
  scroll_to_index: (index: number) => void;
}

/** How many rows PageUp and PageDown move. */
const page_rows = 20;

/**
 * Row-level roving focus for a virtualised grid: one tab stop, arrows and Page keys move it, Home
 * and End jump, Enter activates, Escape dismisses.
 *
 * Focus is held by row id, not by position, so a row inserted above it or a re-sort that moves it
 * leaves focus on the same trade. When that trade leaves the list the tab stop falls back to the
 * first row, and if the departing row held DOM focus, focus follows to the fallback rather than
 * dropping to the page. A jump to a row outside the rendered window asks the grid to scroll and
 * focuses the row when it registers, since it has no element to focus until then.
 *
 * @param ids - Row ids in display order.
 * @param handlers - What moving, Enter, Escape and scrolling do in the grid.
 * @returns Wiring for the grid container and its rows.
 */
export function useRovingRows(ids: readonly string[], handlers: RovingRowsHandlers): RovingRows {
  const [requestedId, setRequestedId] = useState<string | null>(null);
  const elements = useRef<Map<string, HTMLElement>>(new Map());
  const waiting_for = useRef<string | null>(null);
  const holder = useRef<HTMLElement | null>(null);

  const requested_index = useMemo(() => (requestedId === null ? -1 : ids.indexOf(requestedId)), [ids, requestedId]);
  const focused_index = ids.length === 0 ? -1 : Math.max(requested_index, 0);
  const focused_id = ids[focused_index] ?? null;

  const latest = useRef({ ids, focused_index, handlers });
  useLayoutEffect(() => {
    latest.current = { ids, focused_index, handlers };
  });

  const id_of = useCallback((target: EventTarget | null): string | null => {
    for (const [id, element] of elements.current) {
      if (element === target) {
        return id;
      }
    }
    return null;
  }, []);

  const focus_id = useCallback((id: string) => {
    const element = elements.current.get(id);
    if (element === undefined) {
      waiting_for.current = id;
      return;
    }
    waiting_for.current = null;
    element.focus({ preventScroll: true });
  }, []);

  const register_row = useCallback((id: string, element: HTMLElement | null) => {
    if (element === null) {
      elements.current.delete(id);
      return;
    }
    elements.current.set(id, element);
    if (waiting_for.current === id) {
      waiting_for.current = null;
      element.focus({ preventScroll: true });
    }
  }, []);

  const move_to = useCallback(
    (from: number, to: number) => {
      const { ids: current_ids, handlers: current } = latest.current;
      const target = Math.max(0, Math.min(to, current_ids.length - 1));
      const id = current_ids[target];
      if (id === undefined) {
        return;
      }
      setRequestedId(id);
      current.scroll_to_index(target);
      focus_id(id);
      if (target !== from) {
        current.on_move(id);
      }
    },
    [focus_id],
  );

  const on_key_down = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      const id = id_of(event.target);
      if (id === null) {
        return;
      }
      const { ids: current_ids, handlers: current } = latest.current;
      const from = current_ids.indexOf(id);
      const jumps: Record<string, number> = {
        ArrowDown: from + 1,
        ArrowUp: from - 1,
        PageDown: from + page_rows,
        PageUp: from - page_rows,
        Home: 0,
        End: current_ids.length - 1,
      };
      const to = jumps[event.key];

      if (to !== undefined) {
        event.preventDefault();
        move_to(from, to);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        current.on_activate(id);
      } else if (event.key === 'Escape') {
        current.on_escape();
      }
    },
    [id_of, move_to],
  );

  const on_focus = useCallback(
    (event: FocusEvent<HTMLElement>) => {
      const id = id_of(event.target);
      if (id === null) {
        return;
      }
      holder.current = elements.current.get(id) ?? null;
      setRequestedId(id);
    },
    [id_of],
  );

  const on_blur = useCallback((event: FocusEvent<HTMLElement>) => {
    const next = event.relatedTarget;
    // A focused row that is removed from the page blurs with no related target; that case is left
    // to the effect below, which moves focus to the fallback row.
    if (next !== null && !event.currentTarget.contains(next)) {
      holder.current = null;
    }
  }, []);

  const focus_current = useCallback(() => {
    const { ids: current_ids, focused_index: index, handlers: current } = latest.current;
    const id = current_ids[index];
    if (id === undefined) {
      return;
    }
    current.scroll_to_index(index);
    focus_id(id);
  }, [focus_id]);

  useLayoutEffect(() => {
    const element = holder.current;
    if (element === null || element.isConnected) {
      return;
    }
    holder.current = null;
    if (document.activeElement === null || document.activeElement === document.body) {
      focus_current();
    }
  });

  return { focused_id, focused_index, set_focused_id: setRequestedId, on_key_down, on_focus, on_blur, register_row, focus_current };
}
