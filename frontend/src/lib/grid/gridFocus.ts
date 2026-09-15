/** The blotter grid's element id, which the top bar's skip link points at. */
export const trade_grid_id = 'trade-grid';

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
