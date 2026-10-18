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
