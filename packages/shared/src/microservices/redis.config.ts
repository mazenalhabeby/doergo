/**
 * Redis Microservice Configuration Factory
 *
 * Provides consistent Redis transport configuration across all services.
 * Eliminates duplication of Redis setup in each microservice.
 *
 * @example
 * // In microservice main.ts
 * import { createMicroserviceOptions } from '@doergo/shared';
 *
 * const app = await NestFactory.createMicroservice<MicroserviceOptions>(
 *   AppModule,
 *   createMicroserviceOptions(),
 * );
 *
 * @example
 * // In gateway/client module
 * import { createClientOptions, SERVICE_NAMES } from '@doergo/shared';
 *
 * ClientsModule.registerAsync([
 *   createClientOptions(SERVICE_NAMES.AUTH),
 *   createClientOptions(SERVICE_NAMES.TASK),
 * ])
 */
import { Transport, MicroserviceOptions, RedisOptions } from '@nestjs/microservices';
import { ConfigService, ConfigModule } from '@nestjs/config';
import { DEFAULT_REDIS_CONFIG, ServiceName } from './constants';

/**
 * Get Redis configuration from environment or defaults
 */
export function getRedisConfig(configService?: ConfigService): {
  host: string;
  port: number;
} {
  if (configService) {
    return {
      host: configService.get('REDIS_HOST', DEFAULT_REDIS_CONFIG.host),
      port: configService.get('REDIS_PORT', DEFAULT_REDIS_CONFIG.port),
    };
  }

  return {
    host: process.env.REDIS_HOST || DEFAULT_REDIS_CONFIG.host,
    port: parseInt(process.env.REDIS_PORT || String(DEFAULT_REDIS_CONFIG.port), 10),
  };
}

/**
 * Create microservice options for NestFactory.createMicroservice()
 * Used in each microservice's main.ts bootstrap function
 */
export function createMicroserviceOptions(configService?: ConfigService): MicroserviceOptions {
  const redis = getRedisConfig(configService);

  return {
    transport: Transport.REDIS,
    options: {
      host: redis.host,
      port: redis.port,
    },
  };
}

/**
 * Create client options for ClientsModule.registerAsync()
 * Used in gateway and other services that need to communicate with microservices
 */
export function createClientOptions(serviceName: ServiceName) {
  return {
    name: serviceName,
    imports: [ConfigModule],
    useFactory: (configService: ConfigService): RedisOptions => ({
      transport: Transport.REDIS,
      options: getRedisConfig(configService),
    }),
    inject: [ConfigService],
  };
}

/**
 * Create multiple client options at once
 * Convenience function for registering multiple service clients
 */
export function createMultipleClientOptions(serviceNames: ServiceName[]) {
  return serviceNames.map((name) => createClientOptions(name));
}
