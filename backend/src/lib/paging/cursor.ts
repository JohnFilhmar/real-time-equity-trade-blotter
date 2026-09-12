/**
 * Encodes a row id as an opaque page cursor.
 *
 * Base64 not for secrecy but for opacity: a client that can read a cursor starts constructing one,
 * and then the server can never change what a cursor means. The value inside is just the row's
 * uuid, which is enough because every sort carries `id` as its tiebreaker.
 *
 * @param id - The uuid of the last row on the page.
 * @returns The cursor to hand back as `next_cursor`.
 */
export function encode_cursor(id: string): string {
  return Buffer.from(id, 'utf8').toString('base64url');
}

/**
 * Decodes a cursor supplied by a client.
 *
 * A cursor that does not decode to something uuid-shaped is treated as absent rather than as an
 * error, so a stale or hand-edited cursor returns the first page instead of a failure the client
 * cannot recover from without knowing the format.
 *
 * @param cursor - The value from the query string, if any.
 * @returns The row id, or `undefined` when there was no usable cursor.
 */
export function decode_cursor(cursor: string | undefined): string | undefined {
  if (cursor === undefined || cursor.length === 0) {
    return undefined;
  }

  const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
  return /^[0-9a-f-]{36}$/i.test(decoded) ? decoded : undefined;
}
