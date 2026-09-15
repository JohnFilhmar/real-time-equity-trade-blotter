import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import type { UserRepository } from '../interfaces/user_repository.js';
import { create_prisma_user_repository } from './prisma_user_repository.js';

/**
 * The database this tier runs against.
 *
 * Deliberately a separate variable from `DATABASE_URL`, so running the unit tests never points a
 * destructive suite at whatever database happens to be configured. Without it the tier skips.
 */
const test_database_url = process.env.TEST_DATABASE_URL;

/** A username belonging to this run only, so a shared database can be used safely. */
const test_username = `itest_${Date.now().toString()}`;

describe.skipIf(test_database_url === undefined)('prisma user repository', () => {
  let prisma: PrismaClient;
  let repository: UserRepository;

  beforeAll(() => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: test_database_url }),
    });
    repository = create_prisma_user_repository(prisma);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { username: test_username } });
    await prisma.$disconnect();
  });

  it('stores a replacement password hash for an existing account', async () => {
    const user = await repository.create({
      username: test_username,
      passwordHash: 'the-old-hash',
      displayName: 'Integration test',
      traderCode: 'ITEST',
      role: 'TRADER',
    });

    await repository.update_password_hash(user.id, 'the-new-hash');

    expect((await repository.find_by_id(user.id))?.passwordHash).toBe('the-new-hash');
  });

  it('does nothing for an account that does not exist', async () => {
    await expect(
      repository.update_password_hash('3f2504e0-4f89-41d3-9a0c-0305e82c3301', 'the-new-hash'),
    ).resolves.toBeUndefined();
  });
});
