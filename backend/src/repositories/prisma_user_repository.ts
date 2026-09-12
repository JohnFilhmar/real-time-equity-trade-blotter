import type { PrismaClient } from '../generated/prisma/client.js';
import type { NewUser, StoredUser, UserRepository } from '../interfaces/user_repository.js';

/**
 * The Postgres-backed implementation of {@link UserRepository}.
 *
 * @param prisma - A connected client.
 * @returns A repository bound to that client.
 */
export function create_prisma_user_repository(prisma: PrismaClient): UserRepository {
  return {
    async find_by_username(username: string): Promise<StoredUser | null> {
      return prisma.user.findUnique({
        where: { username },
        select: {
          id: true,
          username: true,
          passwordHash: true,
          displayName: true,
          traderCode: true,
          role: true,
        },
      });
    },

    async find_by_id(id: string): Promise<StoredUser | null> {
      return prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          username: true,
          passwordHash: true,
          displayName: true,
          traderCode: true,
          role: true,
        },
      });
    },

    async create(user: NewUser): Promise<StoredUser> {
      return prisma.user.create({
        data: user,
        select: {
          id: true,
          username: true,
          passwordHash: true,
          displayName: true,
          traderCode: true,
          role: true,
        },
      });
    },

    async count(): Promise<number> {
      return prisma.user.count();
    },
  };
}
