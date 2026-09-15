import { create_trade_schema, find_instrument, type CreateTrade, type Trade } from '@blotter/shared';
import { from_datetime_local_value, to_datetime_local_value } from '@/lib/format/clock';
import type { TicketErrors, TicketValues } from '@/types/ticket';
import { to_ticket_errors } from './errors';

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
 * Reads a number box, treating a blank one as missing.
 *
 * `Number('')` is zero, which would tell a trader their blank quantity is too small. The blank
 * becomes `null` rather than `undefined` because the amendment schema reads an absent field as
 * unchanged, while `null` still reaches the rule and asks for a value.
 *
 * @param value - The box's text.
 * @returns The number, `NaN` for text that is not a number, or `null` for a blank box.
 */
export function read_number(value: string): number | null {
  return value.trim() === '' ? null : Number(value);
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
