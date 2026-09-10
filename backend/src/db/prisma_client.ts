import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { env, is_production } from '../config/env.js';

/**
 * Builds a Prisma client bound to a pg driver adapter, which Prisma 7 requires.
 *
 * @returns A client that owns its own connection pool. Call `$disconnect` on shutdown.
 */
export function create_prisma_client(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

  return new PrismaClient({
    adapter,
    log: is_production ? ['warn', 'error'] : ['warn', 'error'],
  });
}

/** The process-wide Prisma client. */
export const prisma = create_prisma_client();
