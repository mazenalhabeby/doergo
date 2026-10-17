/**
 * BullMQ Configuration Factory
 *
 * Provides consistent BullMQ configuration across all services.
 * Ensures exactly-once job processing, even with multiple service instances.
 *
 * @example
 * // In app.module.ts (producer - gateway)
 * import { createBullMQConfig, QUEUE_NAMES } from '@hbcfield/shared';
 *
 * BullModule.forRootAsync(createBullMQConfig()),
 * BullModule.registerQueue({ name: QUEUE_NAMES.TASKS }),
 *
 * @example
 * // In processor service
 * @Processor(QUEUE_NAMES.TASKS)
 * export class TasksProcessor extends WorkerHost {
 *   async process(job: Job) { ... }
 * }
 */
import { BullRootModuleOptions, RegisterQueueOptions } from '@nestjs/bullmq';
import type { FactoryProvider, ModuleMetadata } from '@nestjs/common';
import { ConfigService, ConfigModule } from '@nestjs/config';
import { getRedisConfig } from '../microservices/redis.config';
import { QueueName, DEFAULT_JOB_OPTIONS } from './constants';

/**
 * BullMQ's Redis connection — the same Redis, the same rule (host, port, and a
 * password only when REDIS_PASSWORD is set) as the microservice transport. It
 * was a second copy of `getRedisConfig`; the name stays for its callers.
 */
export const getBullMQRedisConfig = getRedisConfig;

/**
 * Create BullMQ root module configuration for BullModule.forRootAsync()
 * Used in both gateway (producer) and services (consumers)
 */
export function createBullMQConfig(): {
  imports: NonNullable<ModuleMetadata['imports']>;
  useFactory: (configService: ConfigService) => BullRootModuleOptions;
  inject: NonNullable<FactoryProvider['inject']>;
} {
  return {
    imports: [ConfigModule],
    useFactory: (configService: ConfigService): BullRootModuleOptions => {
      const redis = getBullMQRedisConfig(configService);
      const isProduction = configService.get('NODE_ENV') === 'production';

      return {
        connection: {
          host: redis.host,
          port: redis.port,
          ...(redis.password ? { password: redis.password } : {}),
          // Production optimizations
          ...(isProduction && {
            enableReadyCheck: true,
            maxRetriesPerRequest: 3,
          }),
        },
        // Default job options for all queues
        defaultJobOptions: DEFAULT_JOB_OPTIONS.CRITICAL,
      };
    },
    inject: [ConfigService],
  };
}

/**
 * Create queue registration options for a specific queue
 */
export function createQueueOptions(
  queueName: QueueName,
  options?: Partial<RegisterQueueOptions>,
): RegisterQueueOptions {
  return {
    name: queueName,
    ...options,
  };
}
