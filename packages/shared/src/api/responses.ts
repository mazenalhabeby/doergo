/**
 * Standardized API Response Utilities
 *
 * Provides consistent response formatting across all services.
 * Ensures uniform API responses for success, errors, and pagination.
 *
 * @example
 * // Success response
 * return success(user, 'User created successfully');
 *
 * @example
 * // Error response
 * throw new HttpException(error('USER_NOT_FOUND', 'User not found'), HttpStatus.NOT_FOUND);
 *
 * @example
 * // Paginated response
 * return paginated(users, { page: 1, limit: 10, total: 100 });
 */

import type { ApiResponse, PaginationParams } from '../types';

/**
 * Create a success response
 */
export function success<T>(data: T, message?: string): ApiResponse<T> {
  return {
    success: true,
    data,
    ...(message && { message }),
  };
}

/**
 * Create an error response
 */
export function error(code: string, message: string, details?: unknown): ApiResponse<never> {
  const errorObj: ApiResponse<never>['error'] = {
    code,
    message,
  };

  if (details !== undefined) {
    errorObj!.details = details;
  }

  return {
    success: false,
    error: errorObj,
  };
}

/**
 * Pagination metadata interface
 */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * Create a paginated response
 */
export function paginated<T>(
  data: T[],
  meta: { page: number; limit: number; total: number },
): ApiResponse<T[]> {
  return {
    success: true,
    data,
    meta: {
      page: meta.page,
      limit: meta.limit,
      total: meta.total,
      totalPages: Math.ceil(meta.total / meta.limit),
    },
  };
}

/**
 * Calculate pagination offset from page and limit
 */
export function calculateOffset(params: PaginationParams): { skip: number; take: number } {
  const page = params.page || 1;
  const limit = params.limit || 10;

  return {
    skip: (page - 1) * limit,
    take: limit,
  };
}

/**
 * Parse and validate pagination parameters with defaults
 */
export function parsePaginationParams(
  query: Partial<PaginationParams>,
): Required<PaginationParams> {
  return {
    page: Math.max(1, Number(query.page) || 1),
    limit: Math.min(100, Math.max(1, Number(query.limit) || 10)),
    sortBy: query.sortBy || 'createdAt',
    sortOrder: query.sortOrder === 'asc' ? 'asc' : 'desc',
  };
}

/**
 * Common error codes used across services
 */
export const ErrorCodes = {
  // Auth errors
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',

  // Resource errors
  NOT_FOUND: 'NOT_FOUND',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  CONFLICT: 'CONFLICT',

  // Validation errors
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',

  // Server errors
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
