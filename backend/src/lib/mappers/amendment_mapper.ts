import { trade_change_set_schema, type TradeAmendment } from '@blotter/shared';

/**
 * An amendment row as the database hands it back.
 *
 * `changes` is `unknown` because a JSONB column can hold anything the database was ever given,
 * including rows written by an older version of this code. Narrowing it is the mapper's job.
 */
export interface TradeAmendmentRow {
  id: string;
  version: number;
  changes: unknown;
  amendedBy: string;
  amendedAt: Date;
}

/**
 * Converts an amendment row into the shape the history endpoint publishes.
 *
 * The stored `changes` are parsed rather than trusted. JSONB is the one column the database cannot
 * type-check for us, so the shared schema does it here, at the boundary, and a malformed row fails
 * loudly instead of reaching a client as a half-shaped object.
 *
 * @param row - The row as read from the database.
 * @param trade_id - The business identifier of the trade it belongs to, which the row itself holds
 * only as a uuid.
 * @returns The amendment in wire shape.
 * @throws {ZodError} When the stored change set does not match the published contract.
 */
export function to_wire_amendment(row: TradeAmendmentRow, trade_id: string): TradeAmendment {
  return {
    id: row.id,
    tradeId: trade_id,
    version: row.version,
    changes: trade_change_set_schema.parse(row.changes),
    amendedBy: row.amendedBy,
    amendedAt: row.amendedAt.toISOString(),
  };
}
