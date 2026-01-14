/**
 * Microservice Constants
 *
 * Centralized service names and configuration constants
 * used across all microservices.
 */

// Service injection tokens
export const SERVICE_NAMES = {
  AUTH: 'AUTH_SERVICE',
  TASK: 'TASK_SERVICE',
  NOTIFICATION: 'NOTIFICATION_SERVICE',
  TRACKING: 'TRACKING_SERVICE',
} as const;

export type ServiceName = (typeof SERVICE_NAMES)[keyof typeof SERVICE_NAMES];

// Default Redis configuration
export const DEFAULT_REDIS_CONFIG = {
  host: 'localhost',
  port: 6379,
} as const;
