import type { Trade } from '@blotter/shared';
import { format_price, format_quantity } from '@/lib/format/money';
import type { ConflictNote } from '@/types/ticket';

/** A trade field the conflict note compares. */
type ConflictField = keyof Pick<Trade, 'quantity' | 'price' | 'book' | 'counterparty'>;

/** The fields the conflict note compares, in the order it lists them, under the ticket's labels. */
const conflict_fields: readonly { field: ConflictField; label: string }[] = [
  { field: 'quantity', label: 'Quantity' },
  { field: 'price', label: 'Price' },
  { field: 'book', label: 'Book' },
  { field: 'counterparty', label: 'Counterparty' },
];

/** The whole conflict note when the other desk's change was a cancellation. */
const cancelled_conflict_line = 'Another desk cancelled this trade, so it can no longer be amended.';

/**
 * Shows one field's value the way the ticket shows it.
 *
 * @param trade - The trade to read.
 * @param field - The field to show.
 * @returns Quantities with thousands separators, prices to two decimals, anything else as stored.
 */
function show_field(trade: Trade, field: ConflictField): string {
  if (field === 'quantity') {
    return format_quantity(trade.quantity);
  }
  if (field === 'price') {
    return format_price(trade.price);
  }
  return trade[field];
}

/**
 * Describes the other desk's change for the conflict note. After an amendment it lists what differs
 * between the trade the form was opened on and the trade as the server now holds it: each line
 * names the field as the ticket labels it and shows both values as the ticket shows them, such as
 * `Quantity 1,300 → 1,400`. After a cancellation it gives only the sentence saying the trade can no
 * longer be amended.
 *
 * @param base - The trade the form started from.
 * @param current - The trade now.
 * @returns `cancelled` with its sentence when the trade is now cancelled, otherwise `amended` with
 * one line per differing field in ticket order, which is empty when only the version moved.
 */
export function describe_conflict(base: Trade, current: Trade): ConflictNote {
  if (current.status === 'CANCELLED') {
    return { kind: 'cancelled', sentence: cancelled_conflict_line };
  }
  return {
    kind: 'amended',
    lines: conflict_fields
      .filter(({ field }) => base[field] !== current[field])
      .map(({ field, label }) => `${label} ${show_field(base, field)} → ${show_field(current, field)}`),
  };
}
