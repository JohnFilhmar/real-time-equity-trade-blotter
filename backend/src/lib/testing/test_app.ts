import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import type { Role } from '@blotter/shared';
import { create_app } from '../../app.js';
import { create_in_memory_trade_repository } from '../../repositories/in_memory_trade_repository.js';
import { create_in_memory_user_repository } from '../../repositories/in_memory_user_repository.js';
import { create_auth_service } from '../../services/auth_service.js';
import { create_trade_service } from '../../services/trade_service.js';
import type { UserRepository } from '../../interfaces/user_repository.js';
import {
  create_in_memory_login_attempts,
  create_in_memory_refresh_store,
} from '../auth/in_memory_auth_stores.js';
import { sign_access_token } from '../auth/tokens.js';

/** Everything a route test needs to drive the app and to be somebody while doing it. */
export interface TestApp {
  /** The assembled application, with in-memory repositories behind it. */
  app: Express;

  /** Broadcast event names the service emitted, in order. */
  sent: string[];

  /** The account store, for tests that need to create a user with a password. */
  users: UserRepository;
}

/**
 * Builds an app backed by in-memory repositories.
 *
 * Not a mock: both repositories are real implementations of their ports, so a passing route test
 * is asserting behaviour rather than that a spy was called. Only the storage is swapped.
 *
 * @returns The app and the announcements it made.
 */
export function build_test_app(): TestApp {
  const sent: string[] = [];
  const users = create_in_memory_user_repository();

  const trade_service = create_trade_service(create_in_memory_trade_repository(), {
    trade_created: () => sent.push('trade.created'),
    trade_amended: () => sent.push('trade.amended'),
    trade_cancelled: () => sent.push('trade.cancelled'),
  });

  const auth_service = create_auth_service(
    users,
    create_in_memory_refresh_store(),
    create_in_memory_login_attempts(),
  );

  return {
    app: create_app({
      health_probe: { check_connection: async () => undefined },
      trade_service,
      auth_service,
      cors_origins: ['http://localhost:3000'],
    }),
    sent,
    users,
  };
}

/**
 * Signs an access token for a made-up user.
 *
 * Route tests care about what a given role and desk code may do, not about how a password becomes
 * a token, so they sign directly rather than going through login. The login path has its own tests
 * where that is the subject.
 *
 * @param trader_code - The desk code the caller books under.
 * @param role - The role they hold.
 * @returns A bearer token, ready for an Authorization header.
 */
export function token_for(trader_code: string, role: Role = 'TRADER'): string {
  return sign_access_token({
    sub: randomUUID(),
    username: trader_code.toLowerCase(),
    trader_code,
    role,
  });
}

/**
 * Formats a bearer header.
 *
 * @param token - The access token.
 * @returns The header value.
 */
export function bearer(token: string): string {
  return `Bearer ${token}`;
}
