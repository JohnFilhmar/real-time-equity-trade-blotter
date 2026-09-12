import {
  trade_change_set_schema,
  type TradeEvent,
  type TradeEventAction,
  type TradeEventSource,
} from '@blotter/shared';

/**
 * An event row as the database hands it back.
 *
 * `changes` is `unknown` because a JSONB column can hold anything the database was ever given,
 * including rows written by an older version of this code. Narrowing it is the mapper's job.
 */
export interface TradeEventRow {
  id: string;
  version: number;
  action: TradeEventAction;
  source: TradeEventSource;
  changes: unknown;
  actor: string;
  occurredAt: Date;
}

/**
 * Converts an event row into the shape the history endpoint publishes.
 *
 * The stored `changes` are parsed rather than trusted. JSONB is the one column the database cannot
 * type-check for us, so the shared schema does it here, at the boundary, and a malformed row fails
 * loudly instead of reaching a client as a half-shaped object.
 *
 * @param row - The row as read from the database.
 * @param trade_id - The business identifier of the trade it belongs to, which the row itself holds
 * only as a uuid.
 * @returns The event in wire shape.
 * @throws {ZodError} When the stored change set does not match the published contract.
 */
export function to_wire_event(row: TradeEventRow, trade_id: string): TradeEvent {
  return {
    id: row.id,
    tradeId: trade_id,
    version: row.version,
    action: row.action,
    source: row.source,
    changes: trade_change_set_schema.parse(row.changes),
    actor: row.actor,
    occurredAt: row.occurredAt.toISOString(),
  };
}
