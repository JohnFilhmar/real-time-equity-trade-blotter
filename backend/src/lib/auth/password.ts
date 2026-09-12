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
