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
