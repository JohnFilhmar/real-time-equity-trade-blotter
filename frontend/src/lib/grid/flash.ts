import { amendable_trade_schema, type Trade } from '@blotter/shared';

/** How an amended cell moved: a number that rose or fell, or a value that changed with no direction. */
export type CellFlashKind = 'up' | 'down' | 'changed';

/** The flash one amended cell is showing. */
export interface CellFlash {
  kind: CellFlashKind;
  /** The trade version that set it off. Keying the tint by it restarts the animation on every amendment. */
  version: number;
}

/** The flashing cells of one row, keyed by grid column id. */
export type RowCellFlashes = ReadonlyMap<string, CellFlash>;

/** A cell may not begin a new flash within this many milliseconds of its last one. WCAG 2.3.1. */
export const flash_throttle_ms = 333;

/**
 * How long a flash stays attached to a row or a cell. The insert tint fades inside it, and the
 * direction arrow in an amended numeric cell shows for all of it.
 */
export const flash_duration_ms = 1200;

/** The stored fields an amendment may change. The grid column showing each one carries the same id. */
const amendable_fields = amendable_trade_schema.keyof().options;

/**
 * Says how one value moved.
 *
 * @param before - The value as last seen.
 * @param after - The value now.
 * @returns `up` or `down` for a number, `changed` for anything else, or `null` when it did not move.
 */
function movement(before: number | string, after: number | string): CellFlashKind | null {
  if (before === after) {
    return null;
  }
  if (typeof before === 'number' && typeof after === 'number') {
    return after > before ? 'up' : 'down';
  }
  return 'changed';
}

/**
 * Lists the grid cells an amendment changed and which way each one moved.
 *
 * Every amendable field is compared, so a field the amendment schema gains starts flashing with no
 * change here. Notional is derived, so it moves with quantity and price.
 *
 * @param previous - The row as last seen.
 * @param next - The row now.
 * @returns Column id to movement. Empty when nothing visible changed, and for a version that is not
 * newer than the one last seen, which is a stale or repeated broadcast.
 */
export function changed_cells(previous: Trade, next: Trade): ReadonlyMap<string, CellFlashKind> {
  const cells = new Map<string, CellFlashKind>();

  if (next.version <= previous.version) {
    return cells;
  }

  for (const field of amendable_fields) {
    const kind = movement(previous[field], next[field]);
    if (kind !== null) {
      cells.set(field, kind);
    }
  }

  const notional = movement(previous.quantity * previous.price, next.quantity * next.price);
  if (notional !== null) {
    cells.set('notional', notional);
  }

  return cells;
}

/**
 * Whether a cell is still inside the throttle window of its last flash.
 *
 * @param last_flash_at - When the cell last started a flash, in milliseconds on the caller's clock,
 * or `undefined` when it never has.
 * @param now - The current time on the same clock.
 * @returns True when a new flash would start within `flash_throttle_ms` of the last one.
 */
export function is_flash_throttled(last_flash_at: number | undefined, now: number): boolean {
  return last_flash_at !== undefined && now - last_flash_at < flash_throttle_ms;
}
