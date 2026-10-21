import type { Prisma, PrismaClient } from '@prisma/client';

/**
 * PUBLISHED READS (code-structure-fix 3.4). A service reads a table another service owns
 * (docs/data-ownership.md) only through the owner's file here — one named function per question,
 * selecting exactly the columns it returns. That makes "which of my columns do other services rely
 * on" a list the owner can read, and when the databases split, only these files change.
 * Every reader takes the caller's client: a service's own PrismaService or a transaction.
 */
export type ReadDb = PrismaClient | Prisma.TransactionClient;

/**
 * Exactly the table(s) and method a reader calls — so a service's own client, a transaction, a
 * shared helper's narrow client and a test's mock all fit, and the result keeps Prisma's types.
 */
export type On<T extends keyof Prisma.TransactionClient, M extends string> = {
  [K in T]: Pick<Prisma.TransactionClient[K], M & keyof Prisma.TransactionClient[K]>;
};
