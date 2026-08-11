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
import { ConfigService, ConfigModule } from '@nestjs/config';
import { DEFAULT_REDIS_CONFIG } from '../microservices/constants';
import { QUEUE_NAMES, QueueName, DEFAULT_JOB_OPTIONS } from './constants';

/**
 * Get BullMQ Redis connection configuration
 */
export function getBullMQRedisConfig(configService?: ConfigService): {
  host: string;
  port: number;
  password?: string;
} {
  // Password (H14): omitted unless REDIS_PASSWORD is set (empty string = unset).
  const password = configService
    ? configService.get<string>('REDIS_PASSWORD') || undefined
    : process.env.REDIS_PASSWORD || undefined;

  if (configService) {
    return {
      host: configService.get('REDIS_HOST', DEFAULT_REDIS_CONFIG.host),
      port: configService.get('REDIS_PORT', DEFAULT_REDIS_CONFIG.port),
      ...(password ? { password } : {}),
    };
  }

  return {
    host: process.env.REDIS_HOST || DEFAULT_REDIS_CONFIG.host,
    port: parseInt(process.env.REDIS_PORT || String(DEFAULT_REDIS_CONFIG.port), 10),
    ...(password ? { password } : {}),
  };
}

/**
 * Create BullMQ root module configuration for BullModule.forRootAsync()
 * Used in both gateway (producer) and services (consumers)
 */
export function createBullMQConfig(): {
  imports: any[];
  useFactory: (configService: ConfigService) => BullRootModuleOptions;
  inject: any[];
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

/**
 * Create multiple queue registration options at once
 */
export function createMultipleQueueOptions(
  queueNames: QueueName[],
  options?: Partial<RegisterQueueOptions>,
): RegisterQueueOptions[] {
  return queueNames.map((name) => createQueueOptions(name, options));
}

/**
 * Get all queue names for registration
 */
export function getAllQueueNames(): QueueName[] {
  return Object.values(QUEUE_NAMES);
}
