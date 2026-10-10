/**
 * Redis Microservice Configuration Factory
 *
 * Provides consistent Redis transport configuration across all services.
 * Eliminates duplication of Redis setup in each microservice.
 *
 * @example
 * // In microservice main.ts
 * import { createMicroserviceOptions } from '@hbcfield/shared';
 *
 * const app = await NestFactory.createMicroservice<MicroserviceOptions>(
 *   AppModule,
 *   createMicroserviceOptions(),
 * );
 *
 * @example
 * // In gateway/client module
 * import { createClientOptions, SERVICE_NAMES } from '@hbcfield/shared';
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
/** Anything that reads a setting by name — Nest's ConfigService, structurally. Each
 * service resolves its own copy of @nestjs/config, so the class itself does not match. */
export interface ConfigReader {
  get<T = string>(key: string): T | undefined;
}

export function getRedisConfig(configService?: ConfigReader): {
  host: string;
  port: number;
  password?: string;
} {
  // An empty value is unset. Env values are strings; a port is a number.
  const read = (key: string): string | undefined =>
    (configService ? configService.get<string>(key) : process.env[key]) || undefined;
  // Password (H14): only present when REDIS_PASSWORD is set, so dev/test — where
  // Redis runs open — keep connecting with no auth (omit the key rather than send AUTH "").
  const password = read('REDIS_PASSWORD');
  return {
    host: read('REDIS_HOST') ?? DEFAULT_REDIS_CONFIG.host,
    port: Number(read('REDIS_PORT')) || DEFAULT_REDIS_CONFIG.port,
    ...(password ? { password } : {}),
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
      ...(redis.password ? { password: redis.password } : {}),
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
