import { validation_failed_detail, type ProblemFieldError } from '@blotter/shared';
import type { TicketErrors, TicketValues } from '@/types/ticket';

/** Every input the ticket renders, and so every place a field-level message can appear. */
const ticket_inputs: readonly (keyof TicketValues)[] = ['symbol', 'side', 'quantity', 'price', 'book', 'counterparty', 'trade_time'];

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
