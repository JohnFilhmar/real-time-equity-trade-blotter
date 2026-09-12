import type { Trade, TradeChangeSet } from '@blotter/shared';
import type { TradeChanges } from '../../interfaces/trade_repository.js';

/**
 * The fields an amendment can move, and therefore the fields the audit trail records.
 *
 * Listed explicitly rather than derived from the payload's keys, so the audit trail cannot start
 * recording a server-owned field if one is ever added to a schema by mistake. It mirrors
 * `amendable_trade_schema`: symbol, side and the execution timestamp are not amendable, because
 * changing any of them is a rebooking rather than a correction.
 */
const auditable_fields = ['quantity', 'price', 'counterparty', 'book'] as const;

/**
 * Works out what an amendment actually changed.
 *
 * A client may send a field whose value is already the one stored, so the requested changes are
 * not the real ones. Only fields that genuinely moved are recorded, which keeps an amendment that
 * changed one field from producing an audit row claiming it touched four.
 *
 * @param before - The trade as it stood before the amendment.
 * @param changes - The fields the client asked to change.
 * @returns Each moved field with its previous and new value. Empty when nothing moved.
 */
export function build_change_set(before: Trade, changes: TradeChanges): TradeChangeSet {
  const change_set: TradeChangeSet = {};

  for (const field of auditable_fields) {
    const next = changes[field];

    if (next === undefined || next === before[field]) {
      continue;
    }

    change_set[field] = { from: before[field], to: next };
  }

  return change_set;
}

/**
 * The change set recorded for a cancellation.
 *
 * A cancellation is a status transition, and recording it in the same `{from, to}` shape as every
 * other movement means a reader of the history needs one shape rather than two.
 *
 * @returns The status transition, ready to store.
 */
export function build_cancellation_change_set(): TradeChangeSet {
  return { status: { from: 'ACTIVE', to: 'CANCELLED' } };
}
