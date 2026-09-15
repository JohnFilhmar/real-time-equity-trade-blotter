import { afterEach, describe, expect, it, vi } from 'vitest';
import { focus_grid, focus_trades, register_grid_focus, trade_cards_id, trade_loading_id, trade_state_message_id } from './gridFocus';

describe('grid focus target', () => {
  it('reports that nothing took focus when no grid is mounted', () => {
    expect(focus_grid()).toBe(false);
  });

  it('hands focus to the mounted grid until it unregisters', () => {
    const target = vi.fn<() => void>();
    const unregister = register_grid_focus(target);

    expect(focus_grid()).toBe(true);
    expect(target).toHaveBeenCalledTimes(1);

    unregister();

    expect(focus_grid()).toBe(false);
  });

  it('keeps a newer grid registered when an older one unregisters late', () => {
    const older = vi.fn<() => void>();
    const newer = vi.fn<() => void>();
    const unregister_older = register_grid_focus(older);
    const unregister_newer = register_grid_focus(newer);

    unregister_older();
    focus_grid();

    expect(newer).toHaveBeenCalledTimes(1);
    expect(older).not.toHaveBeenCalled();
    unregister_newer();
  });
});

describe('skip link target', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("focuses the grid's current row while the grid is mounted", () => {
    const target = vi.fn<() => void>();
    const unregister = register_grid_focus(target);

    expect(focus_trades()).toBe(true);
    expect(target).toHaveBeenCalledTimes(1);

    unregister();
  });

  it('focuses the first trade card when cards stand in for the grid on a phone', () => {
    document.body.innerHTML = `
      <div id="${trade_cards_id}" role="list">
        <button type="button" role="listitem" data-trade-id="TRD-100002">NVDA</button>
        <button type="button" role="listitem" data-trade-id="TRD-100001">AAPL</button>
      </div>`;

    expect(focus_trades()).toBe(true);
    expect(document.activeElement).toHaveAttribute('data-trade-id', 'TRD-100002');
  });

  it('focuses the message shown in place of the trades when none are listed', () => {
    document.body.innerHTML = `<div id="${trade_state_message_id}" tabindex="-1">No trades match these filters</div>`;

    expect(focus_trades()).toBe(true);
    expect(document.activeElement).toHaveAttribute('id', trade_state_message_id);
  });

  it('focuses the loading area while the first page of trades loads, so focus waits where the rows will appear', () => {
    document.body.innerHTML = `<div id="${trade_loading_id}" tabindex="-1" role="status" aria-busy="true" aria-label="Loading trades"></div>`;

    expect(focus_trades()).toBe(true);
    expect(document.activeElement).toHaveAttribute('id', trade_loading_id);
  });

  it('reports that nothing took focus while none of them is on the page', () => {
    expect(focus_trades()).toBe(false);
  });
});
