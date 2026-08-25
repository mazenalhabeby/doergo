import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';

// Dynamically get API URL based on Expo dev server host
export function getApiUrl(): string {
  // If explicitly set in env (non-empty), use that for production
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl && envUrl.trim().length > 0) {
    return envUrl;
  }

  // In development, get host from Expo's dev server
  const debuggerHost = Constants.expoConfig?.hostUri || Constants.manifest2?.extra?.expoGo?.debuggerHost;

  if (debuggerHost) {
    // debuggerHost is like "192.168.178.26:8081" - extract IP and use API port 4000
    const host = debuggerHost.split(':')[0];
    const url = `http://${host}:4000/api/v1`;
    return url;
  }

  // No env and no dev host: in a shipped (production) app this must hit the real
  // API — NEVER localhost (that's how an OTA with an un-inlined EXPO_PUBLIC_API_URL
  // silently breaks login). Only dev builds fall back to localhost.
  return __DEV__ ? 'http://localhost:4000/api/v1' : 'https://hbcfield.com/api/v1';
}

export const API_URL = getApiUrl();

/**
 * Resolve a media path (e.g. an uploaded avatar `/uploads/avatars/…`) to an
 * absolute URL. React Native's <Image> can't load relative URIs, so uploaded
 * avatars render blank without this. Absolute URLs (http/https, data:) pass
 * through unchanged. The origin is the API host without the `/api/v1` prefix,
 * since static uploads are served from the host root.
 */
export function resolveMediaUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (/^(https?:)?\/\//i.test(url) || url.startsWith('data:')) return url;
  const origin = getApiUrl().replace(/\/api\/v1\/?$/, '');
  return `${origin}${url.startsWith('/') ? '' : '/'}${url}`;
}

// Token storage keys
const ACCESS_TOKEN_KEY = 'hbcfield_access_token';
const REFRESH_TOKEN_KEY = 'hbcfield_refresh_token';

// ============================================================================
// API Response / Error
// ============================================================================

interface ApiResponse<T> {
  success?: boolean;
  data?: T;
  message?: string;
  statusCode?: number;
  error?: string;
}

export class ApiError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'ApiError';
  }
}

// ============================================================================
// Token Management
// ============================================================================

export async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
}

export async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
}

export async function saveTokens(accessToken: string, refreshToken: string): Promise<void> {
  // AFTER_FIRST_UNLOCK: the keychain item stays readable while the phone is
  // LOCKED (after the first unlock post-boot). The default (WHEN_UNLOCKED) throws
  // errSecInteractionNotAllowed in headless background tasks on a locked device,
  // so the background GPS/heartbeat task couldn't read the token → route gaps and
  // a permanent tracker deregister. (Sec audit H12.)
  const opts = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken, opts),
    SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken, opts),
  ]);
}

export async function clearTokens(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
  ]);
}

// ============================================================================
// Auth Failure Callback
// ============================================================================

// Callback to notify auth context of logout
let onAuthFailure: (() => void) | null = null;

export function setAuthFailureCallback(callback: () => void) {
  onAuthFailure = callback;
}

// Callback to update user data when refresh returns fresh user info
let onUserRefreshed: ((user: any) => void) | null = null;

export function setUserRefreshedCallback(callback: (user: any) => void) {
  onUserRefreshed = callback;
}

// ============================================================================
// Token Refresh
// ============================================================================

// Token refresh state - shared promise prevents concurrent refreshes
let refreshPromise: Promise<string | null> | null = null;

interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
  user?: any;
}

/**
 * Refresh access token with queue management
 * Uses a shared promise to ensure only one refresh request is made at a time
 * Backend handles grace period for concurrent requests using the same token
 */
export function refreshAccessToken(): Promise<string | null> {
  // If a refresh is already in progress, wait for it
  if (refreshPromise) {
    return refreshPromise;
  }

  // Create the promise IMMEDIATELY (synchronously) before any await
  refreshPromise = (async () => {
    try {
      const storedRefreshToken = await getRefreshToken();

      if (!storedRefreshToken) {
        return null;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Platform': 'mobile',
        },
        body: JSON.stringify({ refreshToken: storedRefreshToken }),
      });

      clearTimeout(timeoutId);

      const result = await response.json() as ApiResponse<RefreshResponse>;

      if (!response.ok || !result.success) {
        await clearTokens();
        return null;
      }

      const data = result.data;
      if (!data?.accessToken || !data?.refreshToken) {
        await clearTokens();
        return null;
      }

      await saveTokens(data.accessToken, data.refreshToken);

      // Update user data if returned by refresh (eliminates /auth/me call)
      if (data.user && onUserRefreshed) {
        onUserRefreshed(data.user);
      }

      return data.accessToken;
    } catch (error) {
      // Network error / timeout / abort — NOT proof the session is invalid. A
      // field worker in poor coverage must not be logged out and lose their
      // clocked-in context; only an explicit non-2xx / unsuccessful refresh above
      // clears the tokens. Return null so the caller's request fails and retries.
      // (Sec audit mobile-H2.)
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

// ============================================================================
// Offline Mutation Queue
// ============================================================================

interface QueuedMutation {
  endpoint: string;
  options: RequestInit;
  timestamp: number;
}

const mutationQueue: QueuedMutation[] = [];
let isProcessingQueue = false;

function queueMutation(endpoint: string, options: RequestInit) {
  mutationQueue.push({ endpoint, options, timestamp: Date.now() });
  // Keep queue bounded
  if (mutationQueue.length > 50) {
    mutationQueue.shift();
  }
}

export async function processOfflineQueue() {
  if (isProcessingQueue || mutationQueue.length === 0) return;
  isProcessingQueue = true;

  while (mutationQueue.length > 0) {
    const mutation = mutationQueue[0]!;
    // Skip mutations older than 10 minutes
    if (Date.now() - mutation.timestamp > 10 * 60 * 1000) {
      mutationQueue.shift();
      continue;
    }
    try {
      await _fetchWithAuthInner(mutation.endpoint, mutation.options, true);
      mutationQueue.shift(); // Success - remove from queue
    } catch {
      break; // Still offline - stop processing
    }
  }
  isProcessingQueue = false;
}

// ============================================================================
// HTTP Fetch Functions
// ============================================================================

// Request deduplication for GET requests
const inflightRequests = new Map<string, Promise<any>>();

/**
 * Base fetch function without auth
 */
export async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_URL}${endpoint}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Platform': 'mobile',
        ...options.headers,
      },
    });

    clearTimeout(timeoutId);

    const data = await response.json() as ApiResponse<T>;

    if (!response.ok) {
      throw new ApiError(
        sanitizeErrorMessage(data.message, response.status),
        response.status
      );
    }

    return (data.data ?? data) as T;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError('Request timed out. Please check your connection.', 408);
    }
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError('Unable to connect to server. Please check if the API is running.', 0);
  }
}

/** Sanitize server error messages — don't expose internal details to UI */
function sanitizeErrorMessage(message: string | undefined, status: number): string {
  if (status === 401) return 'Authentication failed';
  if (status === 429) return 'Too many requests. Please wait.';
  // Allow 400/403/404 messages through — they contain useful validation info
  if (message && (status === 400 || status === 403 || status === 404 || status === 409)) return message;
  return message || 'An error occurred';
}

/**
 * Authenticated fetch with automatic 401 handling, retry, and GET deduplication
 */
export async function fetchWithAuth<T>(
  endpoint: string,
  options: RequestInit = {},
  retry = true
): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();

  // Deduplicate GET requests - reuse in-flight promise for same endpoint
  if (method === 'GET') {
    const existing = inflightRequests.get(endpoint);
    if (existing) {
      return existing as Promise<T>;
    }
  }

  const promise = _fetchWithAuthInner<T>(endpoint, options, retry);

  if (method === 'GET') {
    inflightRequests.set(endpoint, promise);
    promise.finally(() => inflightRequests.delete(endpoint));
  }

  return promise;
}

async function _fetchWithAuthInner<T>(
  endpoint: string,
  options: RequestInit = {},
  retry = true
): Promise<T> {
  const accessToken = await getAccessToken();
  const url = `${API_URL}${endpoint}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Platform': 'mobile',
        ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
        ...options.headers,
      },
    });

    clearTimeout(timeoutId);

    // Handle 401 - Automatic token refresh and retry
    if (response.status === 401 && retry) {
      const newToken = await refreshAccessToken();

      if (newToken) {
        return _fetchWithAuthInner<T>(endpoint, options, false);
      }

      // Refresh failed - notify auth context which will redirect to login
      if (onAuthFailure) {
        onAuthFailure();
      }
      throw new ApiError('Session expired', 401);
    }

    const data = await response.json() as ApiResponse<T>;

    if (!response.ok) {
      throw new ApiError(
        sanitizeErrorMessage(data.message, response.status),
        response.status
      );
    }

    return (data.data ?? data) as T;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError('Request timed out. Please check your connection.', 408);
    }
    if (error instanceof ApiError) {
      throw error;
    }
    // Network error on a write operation - queue for retry
    const method = (options.method || 'GET').toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') {
      queueMutation(endpoint, options);
    }
    throw new ApiError('Unable to connect to server. Please check if the API is running.', 0);
  }
}
