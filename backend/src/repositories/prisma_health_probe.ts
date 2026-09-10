import type { PrismaClient } from '../generated/prisma/client.js';
import type { HealthProbe } from '../interfaces/health_probe.js';

/**
 * Readiness probe backed by Prisma.
 *
 * @param prisma - Client to issue the connectivity query on.
 * @returns A probe that runs `SELECT 1`, which exercises the pool without touching a table.
 */
export function create_prisma_health_probe(prisma: PrismaClient): HealthProbe {
  return {
    async check_connection(): Promise<void> {
      await prisma.$queryRaw`SELECT 1`;
    },
  };
}
