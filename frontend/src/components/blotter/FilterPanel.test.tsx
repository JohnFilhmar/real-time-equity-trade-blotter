import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { FilterPanel } from './FilterPanel';

// Vitest globals are off here, so Testing Library cannot register its own cleanup between tests.
afterEach(() => {
  cleanup();
});

/**
 * Renders the panel over a stand-in rail with one control in it.
 *
 * @param active_count - How many filters are set.
 * @returns The Filters button.
 */
function render_panel(active_count = 0): HTMLElement {
  render(
    <FilterPanel active_count={active_count}>
      <input aria-label="Symbol" />
    </FilterPanel>,
  );
  return screen.getByRole('button', { name: active_count > 0 ? `Filters ${active_count.toString()}` : 'Filters' });
}

/**
 * The scrim behind the open panel, which closes it on a click.
 *
 * @returns The scrim element.
 * @throws {Error} When no panel is open.
 */
function scrim(): HTMLElement {
  const element = screen.getByRole('dialog').parentElement;
  if (element === null) {
    throw new Error('The panel has no scrim');
  }
  return element;
}

describe('FilterPanel', () => {
  it('shows the active count on the button while filters are set', () => {
    expect(render_panel(2)).toBeInTheDocument();
  });

  it('opens the rail in a modal panel and moves focus into it', () => {
    fireEvent.click(render_panel());

    const panel = screen.getByRole('dialog', { name: 'Filters' });
    expect(panel).toHaveAttribute('aria-modal', 'true');
    expect(panel.contains(document.activeElement)).toBe(true);
    expect(screen.getByRole('textbox', { name: 'Symbol' })).toBeInTheDocument();
  });

  it('closes on Escape and gives focus back to the button', () => {
    const button = render_panel();
    fireEvent.click(button);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(button).toHaveFocus();
  });

  it('closes from its close button and from the scrim', () => {
    const button = render_panel();

    fireEvent.click(button);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(button).toHaveFocus();

    fireEvent.click(button);
    fireEvent.mouseDown(scrim());
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(button).toHaveFocus();
  });
});
