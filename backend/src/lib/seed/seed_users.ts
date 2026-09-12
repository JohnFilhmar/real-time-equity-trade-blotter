import type { Role } from '@blotter/shared';
import { env } from '../../config/env.js';
import type { UserRepository } from '../../interfaces/user_repository.js';
import { hash_password } from '../auth/password.js';
import { logger } from '../logging/logger.js';

/** One demo account. */
interface DemoUser {
  username: string;
  displayName: string;
  traderCode: string;
  role: Role;
}

/**
 * The accounts created in an empty database.
 *
 * Three roles rather than three copies of one, because the point of seeding them is that a
 * reviewer can sign in as each and watch the same screen behave differently: a viewer cannot book,
 * a trader cannot touch somebody else's trade, an administrator can.
 *
 * The desk codes match traders that appear in the seeded trades, so signing in as JSMITH shows a
 * blotter with JSMITH's own trades already on it.
 */
const demo_users: readonly DemoUser[] = [
  { username: 'jsmith', displayName: 'J. Smith', traderCode: 'JSMITH', role: 'TRADER' },
  { username: 'abrown', displayName: 'A. Brown', traderCode: 'ABROWN', role: 'TRADER' },
  { username: 'mjones', displayName: 'M. Jones', traderCode: 'MJONES', role: 'ADMIN' },
  { username: 'viewer', displayName: 'Read Only', traderCode: 'VIEWER', role: 'VIEWER' },
];

/**
 * Creates the demo accounts if, and only if, there are none.
 *
 * Guarded on an empty table for the same reason the trade seed is: running this against a
 * populated system would either fail on the unique index or quietly reset a password somebody was
 * relying on.
 *
 * These are demonstration accounts with a shared, documented password. That is a deliberate
 * property of a throwaway local stack and would be indefensible anywhere else, which is why the
 * log line says so out loud rather than letting it pass unnoticed.
 *
 * @param users - Persistence port for accounts.
 * @returns How many accounts were created, zero when any already existed.
 */
export async function seed_users_if_empty(users: UserRepository): Promise<number> {
  const existing = await users.count();

  if (existing > 0) {
    return 0;
  }

  const password_hash = await hash_password(env.SEED_USER_PASSWORD);

  for (const user of demo_users) {
    await users.create({
      username: user.username,
      passwordHash: password_hash,
      displayName: user.displayName,
      traderCode: user.traderCode,
      role: user.role,
    });
  }

  logger.warn(
    { usernames: demo_users.map((user) => user.username) },
    'seeded_demo_accounts_with_a_shared_password',
  );

  return demo_users.length;
}
