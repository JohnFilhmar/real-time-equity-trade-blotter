import {
  amend_trade_schema,
  create_trade_schema,
  find_instrument,
  type AmendTrade,
  type CreateTrade,
  type Trade,
} from '@blotter/shared';
import type { ProblemFieldError } from '@blotter/shared';
import { from_datetime_local_value, to_datetime_local_value } from '@/lib/format/clock';

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
export const amendable_fields: ReadonlySet<keyof TicketValues> = new Set(['quantity', 'price', 'book', 'counterparty']);

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
 * Maps zod issues and server field errors onto ticket inputs.
 *
 * @param errors - Field errors in the API's shape.
 * @returns Messages keyed by input.
 */
export function to_ticket_errors(errors: readonly ProblemFieldError[]): TicketErrors {
  const mapped: TicketErrors = {};
  for (const error of errors) {
    const field = error.field === 'tradeTimestamp' ? 'trade_time' : error.field;
    if (field in mapped) continue;
    if (['symbol', 'side', 'quantity', 'price', 'book', 'counterparty', 'trade_time'].includes(field)) {
      mapped[field as keyof TicketValues] = error.message;
    } else {
      mapped.form = error.message;
    }
  }
  return mapped;
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
    quantity: Number(values.quantity),
    price: Number(values.price),
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
 *
 * @param values - The inputs.
 * @param trade - The trade being amended.
 * @returns The payload, or the errors to show. Nothing changed is an error.
 */
export function parse_amend(values: TicketValues, trade: Trade): { ok: true; input: AmendTrade } | { ok: false; errors: TicketErrors } {
  const candidate: Record<string, unknown> = { version: trade.version };
  const quantity = Number(values.quantity);
  const price = Number(values.price);

  if (values.quantity !== trade.quantity.toString()) candidate.quantity = quantity;
  if (values.price !== trade.price.toString()) candidate.price = price;
  if (values.book !== trade.book) candidate.book = values.book;
  if (values.counterparty !== trade.counterparty) candidate.counterparty = values.counterparty;

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

/**
 * Lists what changed between the trade the form was opened on and the trade as the server now
 * holds it, for the conflict note.
 *
 * @param base - The trade the form started from.
 * @param current - The trade now.
 * @returns One line per differing field.
 */
export function describe_conflict(base: Trade, current: Trade): string[] {
  const lines: string[] = [];
  const fields: Array<keyof Pick<Trade, 'quantity' | 'price' | 'book' | 'counterparty' | 'status'>> = ['quantity', 'price', 'book', 'counterparty', 'status'];
  for (const field of fields) {
    if (base[field] !== current[field]) {
      lines.push(`${field}: ${String(base[field])} → ${String(current[field])}`);
    }
  }
  return lines;
}
