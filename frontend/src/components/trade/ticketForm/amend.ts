import { amend_trade_schema, type AmendTrade, type Trade } from '@blotter/shared';
import type { TicketErrors, TicketValues } from '@/types/ticket';
import { to_ticket_errors } from './errors';
import { read_number } from './values';

/** The fields an amendment may change; the rest of the ticket is read-only in that mode. */
export const amendable_fields: ReadonlySet<keyof TicketValues> = new Set(['quantity', 'price', 'book']);

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
