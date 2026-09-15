import { randomBytes } from 'node:crypto';
import bcrypt from 'bcrypt';
import { env } from '../../config/env.js';

/**
 * bcrypt truncates anything past 72 bytes.
 *
 * Silently ignoring the rest would mean two different long passwords authenticate each other, so
 * the limit is enforced rather than discovered. The login schema already caps at 200 characters;
 * this is the check that makes the cap meaningful.
 */
const max_password_bytes = 72;

/**
 * Hashes a password for storage.
 *
 * @param password - The plaintext password.
 * @returns The bcrypt hash, salt included.
 * @throws {Error} When the password exceeds what bcrypt can actually read.
 */
export async function hash_password(password: string): Promise<string> {
  assert_within_bcrypt_limit(password);
  return bcrypt.hash(password, env.BCRYPT_ROUNDS);
}

/**
 * Checks a password against a stored hash.
 *
 * Returns false rather than throwing on a too-long password, because this runs on the login path
 * where every failure has to look identical from the outside.
 *
 * @param password - The plaintext password supplied.
 * @param hash - The stored hash.
 * @returns True when they match.
 */
export async function verify_password(password: string, hash: string): Promise<boolean> {
  if (Buffer.byteLength(password, 'utf8') > max_password_bytes) {
    return false;
  }

  return bcrypt.compare(password, hash);
}

/**
 * Makes a hash of a random value nobody holds, at the configured cost.
 *
 * The login path compares against it when a username does not exist, so a missing account costs the
 * same bcrypt work as a real one with the wrong password at whatever `BCRYPT_ROUNDS` is set to. A
 * fixed hash written into the source would keep its own cost and drift from real hashes the moment
 * the setting changed.
 *
 * @returns A bcrypt hash no password matches in practice, salted afresh on every call.
 */
export async function create_dummy_hash(): Promise<string> {
  return hash_password(randomBytes(32).toString('base64url'));
}

/**
 * Says whether a stored hash was made at a different cost from the configured one.
 *
 * A hash made before `BCRYPT_ROUNDS` changed still verifies, but its bcrypt work, and so its
 * response time, no longer matches the dummy hash that unknown usernames are checked against.
 *
 * @param hash - A stored bcrypt hash.
 * @returns True when the hash's cost differs from `BCRYPT_ROUNDS`. False at the configured cost, and
 * for a value bcrypt cannot read, which no password can have matched.
 */
export function needs_rehash(hash: string): boolean {
  try {
    return bcrypt.getRounds(hash) !== env.BCRYPT_ROUNDS;
  } catch {
    return false;
  }
}

/**
 * Refuses a password bcrypt cannot fully read.
 *
 * @param password - The plaintext password.
 * @throws {Error} When it is longer than 72 bytes.
 */
function assert_within_bcrypt_limit(password: string): void {
  if (Buffer.byteLength(password, 'utf8') > max_password_bytes) {
    throw new Error(`password exceeds the ${max_password_bytes.toString()} byte bcrypt limit`);
  }
}
