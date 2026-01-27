/**
 * Shared Query Utilities
 * Centralized query string building to avoid duplication in API calls.
 */

/**
 * Build a URL query string from an object of parameters
 * Filters out null, undefined, and empty string values
 *
 * @example
 * buildQueryString({ page: 1, limit: 10, search: '' })
 * // Returns: "page=1&limit=10"
 *
 * @example
 * buildQueryString({ date: '2026-01-27', status: undefined })
 * // Returns: "date=2026-01-27"
 */
export function buildQueryString<T extends object>(params: T): string {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.set(key, String(value));
    }
  });

  return searchParams.toString();
}

/**
 * Build a complete URL with query string
 *
 * @example
 * buildUrlWithQuery('/api/users', { page: 1, limit: 10 })
 * // Returns: "/api/users?page=1&limit=10"
 *
 * @example
 * buildUrlWithQuery('/api/users', {})
 * // Returns: "/api/users"
 */
export function buildUrlWithQuery<T extends object>(baseUrl: string, params: T): string {
  const queryString = buildQueryString(params);
  return queryString ? `${baseUrl}?${queryString}` : baseUrl;
}

/**
 * Parse a query string into an object
 *
 * @example
 * parseQueryString("page=1&limit=10")
 * // Returns: { page: "1", limit: "10" }
 */
export function parseQueryString(queryString: string): Record<string, string> {
  const params = new URLSearchParams(queryString);
  const result: Record<string, string> = {};

  params.forEach((value, key) => {
    result[key] = value;
  });

  return result;
}

/**
 * Build pagination params object
 *
 * @example
 * buildPaginationParams(2, 20)
 * // Returns: { page: 2, limit: 20 }
 */
export function buildPaginationParams(
  page?: number,
  limit?: number,
): { page?: number; limit?: number } {
  const params: { page?: number; limit?: number } = {};
  if (page !== undefined && page > 0) params.page = page;
  if (limit !== undefined && limit > 0) params.limit = limit;
  return params;
}

/**
 * Build date range params object
 *
 * @example
 * buildDateRangeParams('2026-01-01', '2026-01-31')
 * // Returns: { startDate: '2026-01-01', endDate: '2026-01-31' }
 */
export function buildDateRangeParams(
  startDate?: string,
  endDate?: string,
): { startDate?: string; endDate?: string } {
  const params: { startDate?: string; endDate?: string } = {};
  if (startDate) params.startDate = startDate;
  if (endDate) params.endDate = endDate;
  return params;
}
