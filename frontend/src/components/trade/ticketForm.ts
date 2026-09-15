import {
  amend_trade_schema,
  create_trade_schema,
  find_instrument,
  validation_failed_detail,
  type AmendTrade,
  type CreateTrade,
  type Trade,
} from '@blotter/shared';
import type { ProblemFieldError } from '@blotter/shared';
import { from_datetime_local_value, to_datetime_local_value } from '@/lib/format/clock';
import { format_price, format_quantity } from '@/lib/format/money';

/** What the ticket's inputs hold, as strings, before validation. */
export interface TicketValues {
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: string;
  price: string;
  book: string;
  counterparty: string;
  /** `datetime-local` form, UTC. */
  trade_time: string;
}

/** Field-level messages keyed by input name. */
export type TicketErrors = Partial<Record<keyof TicketValues | 'form', string>>;

/** The fields an amendment may change; the rest of the ticket is read-only in that mode. */
export const amendable_fields: ReadonlySet<keyof TicketValues> = new Set(['quantity', 'price', 'book']);

/**
 * Whether the ticket marks an input as required, with an asterisk after its label and
 * `aria-required` on the control. Only the counterparty carries the mark, and only on a new ticket.
 * An amendment locks the counterparty, so there it looks like the other locked inputs instead of
 * asking for a value.
 *
 * @param field - The ticket input.
 * @param trade - The trade being amended, or `null` for a new ticket.
 * @returns True when the input shows as required.
 */
export function shows_required(field: keyof TicketValues, trade: Trade | null): boolean {
  return field === 'counterparty' && trade === null;
}

/** Every input the ticket renders, and so every place a field-level message can appear. */
const ticket_inputs: readonly (keyof TicketValues)[] = ['symbol', 'side', 'quantity', 'price', 'book', 'counterparty', 'trade_time'];

/**
 * Builds the ticket's initial values: a blank ticket for the first instrument, or the selected
 * trade's current values for an amendment.
 *
 * @param trade - The trade being amended, or `null` for a new ticket.
 * @returns The values.
 */
export function initial_values(trade: Trade | null): TicketValues {
  if (trade !== null) {
    return {
      symbol: trade.symbol,
      side: trade.side,
      quantity: trade.quantity.toString(),
      price: trade.price.toString(),
      book: trade.book,
      counterparty: trade.counterparty,
      trade_time: to_datetime_local_value(new Date(trade.tradeTimestamp)),
    };
  }

  const first = find_instrument('AAPL');
  return {
    symbol: 'AAPL',
    side: 'BUY',
    quantity: '1000',
    price: first === undefined ? '' : first.base_price.toFixed(2),
    book: first?.book ?? '',
    counterparty: '',
    trade_time: to_datetime_local_value(new Date()),
  };
}

/**
 * Whether a field name from a validation message is one of the ticket's inputs.
 *
 * @param field - The field name, already translated from the API's spelling.
 * @returns True when the ticket has an input to show the message beside.
 */
function is_ticket_input(field: string): field is keyof TicketValues {
  return ticket_inputs.some((input) => input === field);
}

/**
 * Reads a number box, treating a blank one as missing.
 *
 * `Number('')` is zero, which would tell a trader their blank quantity is too small. The blank
 * becomes `null` rather than `undefined` because the amendment schema reads an absent field as
 * unchanged, while `null` still reaches the rule and asks for a value.
 *
 * @param value - The box's text.
 * @returns The number, `NaN` for text that is not a number, or `null` for a blank box.
 */
function read_number(value: string): number | null {
  return value.trim() === '' ? null : Number(value);
}

/**
 * Maps zod issues and server field errors onto ticket inputs.
 *
 * Each input keeps the first message it is given. A message naming a field the ticket has no input
 * for goes to the form line instead of being dropped, and the form line keeps the first of those.
 *
 * @param errors - Field errors in the API's shape.
 * @returns Messages keyed by input, with `form` holding any message no input can show.
 */
export function to_ticket_errors(errors: readonly ProblemFieldError[]): TicketErrors {
  const mapped: TicketErrors = {};
  for (const error of errors) {
    const field = error.field === 'tradeTimestamp' ? 'trade_time' : error.field;
    const key = is_ticket_input(field) ? field : 'form';
    mapped[key] ??= error.message;
  }
  return mapped;
}

/**
 * Maps the API's validation refusal onto the ticket: each field message beside its input, and the
 * problem's detail on the form line too unless it is the generic sentence every schema failure
 * carries. A rule with a detail of its own, such as the desk limit, is then explained in full.
 *
 * @param detail - The problem's detail.
 * @param errors - The problem's field errors, in the API's shape.
 * @returns Messages keyed by input, plus the detail on the form line unless it is the generic sentence.
 */
export function to_refusal_errors(detail: string, errors: readonly ProblemFieldError[]): TicketErrors {
  const mapped = to_ticket_errors(errors);
  return detail === validation_failed_detail ? mapped : { ...mapped, form: detail };
}

/**
 * Validates a new ticket with the same schema the server runs.
 *
 * @param values - The inputs.
 * @returns The payload, or the errors to show.
 */
export function parse_create(values: TicketValues): { ok: true; input: CreateTrade } | { ok: false; errors: TicketErrors } {
  const candidate = {
    symbol: values.symbol,
    side: values.side,
    quantity: read_number(values.quantity),
    price: read_number(values.price),
    book: values.book,
    counterparty: values.counterparty,
    tradeTimestamp: from_datetime_local_value(values.trade_time) ?? '',
  };

  const parsed = create_trade_schema.safeParse(candidate);
  if (parsed.success) {
    return { ok: true, input: parsed.data };
  }

  return {
    ok: false,
    errors: to_ticket_errors(parsed.error.issues.map((issue) => ({ field: String(issue.path[0] ?? 'form'), message: issue.message }))),
  };
}

/**
 * Validates an amendment: only the fields that differ from the trade are sent, plus the version.
 * The counterparty is never sent, because it is fixed once the trade is booked.
 *
 * @param values - The inputs.
 * @param trade - The trade being amended.
 * @returns The payload, or the errors to show. Nothing changed is an error.
 */
export function parse_amend(values: TicketValues, trade: Trade): { ok: true; input: AmendTrade } | { ok: false; errors: TicketErrors } {
  const candidate: Record<string, unknown> = { version: trade.version };

  if (values.quantity !== trade.quantity.toString()) candidate.quantity = read_number(values.quantity);
  if (values.price !== trade.price.toString()) candidate.price = read_number(values.price);
  if (values.book !== trade.book) candidate.book = values.book;

  if (Object.keys(candidate).length === 1) {
    return { ok: false, errors: { form: 'Change at least one field before saving' } };
  }

  const parsed = amend_trade_schema.safeParse(candidate);
  if (parsed.success) {
    return { ok: true, input: parsed.data };
  }

  return {
    ok: false,
    errors: to_ticket_errors(parsed.error.issues.map((issue) => ({ field: String(issue.path[0] ?? 'form'), message: issue.message }))),
  };
}

/** A trade field the conflict note compares. */
type ConflictField = keyof Pick<Trade, 'quantity' | 'price' | 'book' | 'counterparty'>;

/**
 * What the ticket's conflict note says. An amendment by another desk lists the fields that moved,
 * under the note's opener and beside the offer to reopen on the current values. A cancellation is
 * one sentence and nothing else, since nothing is left to reopen and amend.
 */
export type ConflictNote =
  | {
      kind: 'amended';
      /** One line per field that differs, in ticket order. Empty when only the version moved. */
      lines: string[];
    }
  | {
      kind: 'cancelled';
      /** The whole note. */
      sentence: string;
    };

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
