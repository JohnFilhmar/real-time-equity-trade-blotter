import type { Redis } from 'ioredis';
import { env } from '../../config/env.js';

/**
 * What happened when a refresh token was presented.
 *
 * `reused` is the one that matters: it means a token that had already been rotated came back, so
 * either an attacker has a stolen copy or a client is replaying. Either way the whole session
 * family is gone by the time this value is returned.
 */
export type RefreshOutcome = 'rotated' | 'reused' | 'unknown';

/**
 * Rotates a family's active token, atomically, and revokes the family on replay.
 *
 * Written as a Lua script because read-then-write is a race: two requests carrying the same token
 * could both read the same active id and both be told they rotated cleanly, which is exactly the
 * replay this is meant to catch. Redis runs a script without interleaving, so the comparison and
 * the write are one step.
 */
const rotate_script = `
local current = redis.call('GET', KEYS[1])
if current == false then
  return 'unknown'
end
if current ~= ARGV[1] then
  redis.call('DEL', KEYS[1])
  return 'reused'
end
redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
return 'rotated'
`;

/**
 * Where a session family's currently valid token id lives.
 *
 * @param family - The family id.
 * @returns The Redis key.
 */
function family_key(family: string): string {
  return `refresh:family:${family}`;
}

/** Tracks which refresh token is currently valid for each session family. */
export interface RefreshStore {
  /**
   * Records the first token of a new session family, at login.
   *
   * @param family - The new family id.
   * @param jti - The id of the token just issued.
   */
  start(family: string, jti: string): Promise<void>;

  /**
   * Exchanges the presented token for the next one.
   *
   * @param family - The family the token claims to belong to.
   * @param presented_jti - The id carried by the token presented.
   * @param next_jti - The id of the replacement token.
   * @returns `rotated` on success, `reused` when the family has been revoked for replay, and
   * `unknown` when the family has expired or was already logged out.
   */
  rotate(family: string, presented_jti: string, next_jti: string): Promise<RefreshOutcome>;

  /**
   * Ends a session family, at logout.
   *
   * @param family - The family to end.
   */
  revoke(family: string): Promise<void>;
}

/**
 * Builds the Redis-backed refresh store.
 *
 * Redis rather than a table because expiry is then the datastore's job: a family key carries the
 * refresh lifetime as its TTL and disappears on its own, with no cleanup path to write or forget.
 * The trade-off is that a Redis restart signs everybody out, which for this service is an
 * acceptable failure mode rather than data loss.
 *
 * @param redis - A connected client.
 * @returns The store.
 */
export function create_refresh_store(redis: Redis): RefreshStore {
  return {
    async start(family: string, jti: string): Promise<void> {
      await redis.set(family_key(family), jti, 'EX', env.REFRESH_TOKEN_TTL_SECONDS);
    },

    async rotate(family: string, presented_jti: string, next_jti: string): Promise<RefreshOutcome> {
      const result: unknown = await redis.eval(
        rotate_script,
        1,
        family_key(family),
        presented_jti,
        next_jti,
        String(env.REFRESH_TOKEN_TTL_SECONDS),
      );

      if (result === 'rotated' || result === 'reused' || result === 'unknown') {
        return result;
      }

      // The script only ever returns one of those three. Anything else means the script and this
      // code have drifted, which is a bug rather than a client problem.
      throw new Error(`refresh rotation returned an unexpected result: ${String(result)}`);
    },

    async revoke(family: string): Promise<void> {
      await redis.del(family_key(family));
    },
  };
}
