/** The blotter grid's element id, which the top bar's skip link points at. */
export const trade_grid_id = 'trade-grid';

/** The element id of the phone card list, where the skip link finds the first card. */
export const trade_cards_id = 'trade-cards';

/** The element id of the message shown in the trades' place when none are listed. */
export const trade_state_message_id = 'trade-state-message';

/** Moves keyboard focus to the grid's tab-stop row. */
type FocusTarget = () => void;

let registered: FocusTarget | null = null;

/**
 * Registers the mounted blotter grid as the place focus goes when something outside it sends
 * focus back, such as the skip link in the top bar or the detail panel closing.
 *
 * One grid is mounted at a time, so a later registration replaces an earlier one.
 *
 * @param target - Moves focus to the grid's tab-stop row.
 * @returns Unregisters the target. Does nothing if another target has registered since.
 */
export function register_grid_focus(target: FocusTarget): () => void {
  registered = target;
  return () => {
    if (registered === target) {
      registered = null;
    }
  };
}

/**
 * Moves keyboard focus to the blotter grid's tab-stop row.
 *
 * @returns True when a grid was mounted to take focus, false when there was none, as on the phone
 * layout or while the grid shows an empty state.
 */
export function focus_grid(): boolean {
  if (registered === null) {
    return false;
  }
  registered();
  return true;
}

/**
 * Moves keyboard focus to the trades in whatever form the blotter shows them: the grid's tab-stop
 * row, the first card on a phone, or the message shown in their place when none are listed.
 *
 * @returns True when one of them took focus, false when none is on the page, as while the first
 * page loads.
 */
export function focus_trades(): boolean {
  if (focus_grid()) {
    return true;
  }
  const target =
    document.getElementById(trade_cards_id)?.querySelector<HTMLElement>('[data-trade-id]') ??
    document.getElementById(trade_state_message_id);
  if (target === null) {
    return false;
  }
  target.focus();
  return true;
}
