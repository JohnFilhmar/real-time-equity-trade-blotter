import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useRovingRows } from './useRovingRows';

/** Props for {@link Harness}. */
interface HarnessProps {
  ids: readonly string[];
  /** How many rows render at once, standing in for the virtualiser's window. */
  window_size?: number;
  on_move?: (id: string) => void;
  on_activate?: (id: string) => void;
  on_escape?: () => void;
}

/**
 * A grid wired the way TradeGrid wires the hook, rendering only a window of rows that moves when
 * the hook asks for a row to be scrolled into view.
 *
 * @param props - Row ids, window size and spies.
 * @returns The grid and a skip link.
 */
function Harness({ ids, window_size = ids.length, on_move = () => undefined, on_activate = () => undefined, on_escape = () => undefined }: HarnessProps): ReactNode {
  const [start, setStart] = useState(0);
  const roving = useRovingRows(ids, {
    on_move,
    on_activate,
    on_escape,
    scroll_to_index: (index) => {
      setStart((current) => (index < current || index >= current + window_size ? Math.max(0, index - window_size + 1) : current));
    },
  });

  return (
    <>
      <button type="button" onClick={roving.focus_current}>
        Skip to trades
      </button>
      <div role="grid" aria-label="Trades" onKeyDown={roving.on_key_down} onFocus={roving.on_focus} onBlur={roving.on_blur}>
        <button type="button">Sort</button>
        {ids.slice(start, start + window_size).map((id) => (
          <div
            key={id}
            role="row"
            aria-label={id}
            tabIndex={id === roving.focused_id ? 0 : -1}
            ref={(element) => roving.register_row(id, element)}
            onClick={() => roving.set_focused_id(id)}
          />
        ))}
      </div>
    </>
  );
}

/**
 * Finds a rendered row by its id.
 *
 * @param id - The row id.
 * @returns The row element.
 */
function row(id: string): HTMLElement {
  return screen.getByRole('row', { name: id });
}

/**
 * Presses a key on whatever row holds focus.
 *
 * @param key - The key name.
 */
function press(key: string): void {
  const focused = screen.getAllByRole('row').find((element) => element === document.activeElement);
  if (focused === undefined) {
    throw new Error('No row holds focus');
  }
  fireEvent.keyDown(focused, { key });
}

const letters = ['a', 'b', 'c', 'd', 'e'];

describe('useRovingRows', () => {
  afterEach(() => {
    cleanup();
  });

  it('moves focus down and up by row, keeping a single tab stop', () => {
    render(<Harness ids={letters} />);
    act(() => row('a').focus());

    press('ArrowDown');

    expect(document.activeElement).toBe(row('b'));
    expect(screen.getAllByRole('row').filter((element) => element.tabIndex === 0)).toEqual([row('b')]);

    press('ArrowUp');

    expect(document.activeElement).toBe(row('a'));
  });

  it('keeps focus on the same trade when rows arrive above it', () => {
    const { rerender } = render(<Harness ids={letters} />);
    act(() => row('c').focus());

    rerender(<Harness ids={['x', 'y', ...letters]} />);

    expect(document.activeElement).toBe(row('c'));
    expect(row('c').tabIndex).toBe(0);

    press('ArrowDown');

    expect(document.activeElement).toBe(row('d'));
  });

  it('falls back to the first row when the focused trade leaves the list, without losing focus', () => {
    const { rerender } = render(<Harness ids={letters} />);
    act(() => row('c').focus());

    rerender(<Harness ids={['a', 'b', 'd', 'e']} />);

    expect(row('a').tabIndex).toBe(0);
    expect(document.activeElement).toBe(row('a'));
  });

  it('jumps to rows outside the rendered window and focuses each once it renders', () => {
    const ids = Array.from({ length: 30 }, (_value, index) => `r${index.toString()}`);
    render(<Harness ids={ids} window_size={5} />);
    act(() => row('r0').focus());

    press('End');
    expect(document.activeElement).toBe(row('r29'));

    press('Home');
    expect(document.activeElement).toBe(row('r0'));

    press('PageDown');
    expect(document.activeElement).toBe(row('r20'));

    press('PageUp');
    expect(document.activeElement).toBe(row('r0'));
  });

  it('reports each move so an open panel can follow, and hands Enter and Escape to the grid', () => {
    const on_move = vi.fn<(id: string) => void>();
    const on_activate = vi.fn<(id: string) => void>();
    const on_escape = vi.fn<() => void>();
    render(<Harness ids={letters} on_move={on_move} on_activate={on_activate} on_escape={on_escape} />);
    act(() => row('a').focus());

    press('ArrowUp');
    press('ArrowDown');
    press('Enter');
    press('Escape');

    expect(on_move.mock.calls).toEqual([['b']]);
    expect(on_activate).toHaveBeenCalledWith('b');
    expect(on_escape).toHaveBeenCalledTimes(1);
  });

  it('leaves keys pressed on other controls inside the grid to those controls', () => {
    const on_activate = vi.fn<(id: string) => void>();
    render(<Harness ids={letters} on_activate={on_activate} />);
    const sort = screen.getByRole('button', { name: 'Sort' });

    const not_prevented = fireEvent.keyDown(sort, { key: 'Enter' });

    expect(not_prevented).toBe(true);
    expect(on_activate).not.toHaveBeenCalled();
  });

  it('moves the tab stop to a clicked row, and returns focus to it from outside the grid', () => {
    render(<Harness ids={letters} />);

    fireEvent.click(row('d'));
    expect(row('d').tabIndex).toBe(0);

    const skip = screen.getByRole('button', { name: 'Skip to trades' });
    act(() => skip.focus());
    fireEvent.click(skip);

    expect(document.activeElement).toBe(row('d'));
  });
});
