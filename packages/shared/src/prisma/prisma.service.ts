import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Shared Prisma Service
 *
 * This service provides database connectivity across all microservices.
 * It follows the Singleton pattern through NestJS DI and properly handles
 * connection lifecycle.
 *
 * @example
 * ```typescript
 * // In your module
 * import { PrismaModule } from '@hbcfield/shared';
 *
 * @Module({
 *   imports: [PrismaModule],
 * })
 * export class AppModule {}
 * ```
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    // Bound the connection pool per service instance so (pool × instances) stays
    // under Postgres max_connections at horizontal scale. Tune via
    // PRISMA_CONNECTION_LIMIT (default 10); respects a limit already in the URL.
    const url = process.env.DATABASE_URL || '';
    const limit = process.env.PRISMA_CONNECTION_LIMIT || '10';
    const pooledUrl =
      url && !url.includes('connection_limit')
        ? `${url}${url.includes('?') ? '&' : '?'}connection_limit=${limit}`
        : url;
    super(pooledUrl ? { datasources: { db: { url: pooledUrl } } } : undefined);
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Clean database for testing purposes
   * Only use in test environment
   */
  async cleanDatabase(): Promise<void> {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('cleanDatabase can only be called in test environment');
    }

    const tablenames = await this.$queryRaw<
      Array<{ tablename: string }>
    >`SELECT tablename FROM pg_tables WHERE schemaname='public'`;

    for (const { tablename } of tablenames) {
      if (tablename !== '_prisma_migrations') {
        await this.$executeRawUnsafe(`TRUNCATE TABLE "public"."${tablename}" CASCADE;`);
      }
    }
  }
}
