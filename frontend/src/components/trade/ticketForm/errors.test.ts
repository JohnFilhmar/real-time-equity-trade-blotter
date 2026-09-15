import { describe, expect, it } from 'vitest';
import { validation_failed_detail } from '@blotter/shared';
import { to_refusal_errors, to_ticket_errors } from './errors';

describe('to_ticket_errors', () => {
  it('places each server message beside the input it names', () => {
    expect(
      to_ticket_errors([
        { field: 'quantity', message: 'Quantity must be a whole number above zero' },
        { field: 'tradeTimestamp', message: 'Trade time cannot be in the future' },
      ]),
    ).toEqual({
      quantity: 'Quantity must be a whole number above zero',
      trade_time: 'Trade time cannot be in the future',
    });
  });

  it('puts a message for a field the ticket does not show on the form line instead of dropping it', () => {
    expect(to_ticket_errors([{ field: 'version', message: 'Reload the trade and try again' }])).toEqual({
      form: 'Reload the trade and try again',
    });
  });

  it('keeps the first message for each input and for the form line', () => {
    expect(
      to_ticket_errors([
        { field: 'book', message: 'Enter a book' },
        { field: 'book', message: 'Book cannot be longer than 64 characters' },
        { field: 'version', message: 'Reload the trade and try again' },
        { field: '', message: 'One or more fields failed validation.' },
      ]),
    ).toEqual({ book: 'Enter a book', form: 'Reload the trade and try again' });
  });
});

describe('to_refusal_errors', () => {
  it('puts a desk-limit refusal on the form line as well as beside the quantity', () => {
    expect(
      to_refusal_errors('This trade is worth £41,000,000, over the £40,000,000 limit for London names.', [
        { field: 'quantity', message: 'This trade is over the desk limit. Lower the quantity or price.' },
      ]),
    ).toEqual({
      quantity: 'This trade is over the desk limit. Lower the quantity or price.',
      form: 'This trade is worth £41,000,000, over the £40,000,000 limit for London names.',
    });
  });

  it("leaves the API's generic sentence for a plain validation failure off the form line", () => {
    expect(to_refusal_errors(validation_failed_detail, [{ field: 'price', message: 'Price must be above zero' }])).toEqual({
      price: 'Price must be above zero',
    });
  });
});
