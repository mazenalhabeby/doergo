'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, Button } from '@/components/ui';
import {
  Key,
  Timer,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertTriangle,
  User,
  ListTodo,
  MapPin
} from 'lucide-react';
import { getAccessToken, getRefreshToken, api } from '@/lib/api';

// Decode JWT to get expiration
function decodeJwt(token: string) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

interface TestResult {
  endpoint: string;
  success: boolean;
  status: number;
  message: string;
  timestamp: Date;
  tokenRefreshed?: boolean;
}

export default function TokenTestPage() {
  const [accessExpiry, setAccessExpiry] = useState<Date | null>(null);
  const [refreshExpiry, setRefreshExpiry] = useState<Date | null>(null);
  const [timeLeft, setTimeLeft] = useState({ access: 0, refresh: 0 });
  const [results, setResults] = useState<TestResult[]>([]);
  const [isLoading, setIsLoading] = useState<string | null>(null);

  // Load token expiry times
  const loadTokenExpiry = () => {
    const access = getAccessToken();
    const refresh = getRefreshToken();

    if (access) {
      const decoded = decodeJwt(access);
      if (decoded?.exp) {
        setAccessExpiry(new Date(decoded.exp * 1000));
      }
    } else {
      setAccessExpiry(null);
    }

    if (refresh) {
      const decoded = decodeJwt(refresh);
      if (decoded?.exp) {
        setRefreshExpiry(new Date(decoded.exp * 1000));
      }
    } else {
      setRefreshExpiry(null);
    }
  };

  useEffect(() => {
    loadTokenExpiry();
    const interval = setInterval(loadTokenExpiry, 5000);
    return () => clearInterval(interval);
  }, []);

  // Update countdown every second
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setTimeLeft({
        access: accessExpiry ? Math.max(0, Math.floor((accessExpiry.getTime() - now) / 1000)) : 0,
        refresh: refreshExpiry ? Math.max(0, Math.floor((refreshExpiry.getTime() - now) / 1000)) : 0,
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [accessExpiry, refreshExpiry]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Add result to history
  const addResult = (result: TestResult) => {
    setResults((prev) => [result, ...prev].slice(0, 20));
    loadTokenExpiry(); // Refresh token times after each call
  };

  // Test endpoints
  const testEndpoint = async (endpoint: string, name: string) => {
    setIsLoading(endpoint);
    const tokenBefore = getAccessToken();

    try {
      const response = await api.get<unknown>(endpoint);
      const tokenAfter = getAccessToken();

      addResult({
        endpoint: name,
        success: !response.error,
        status: response.status,
        message: response.error || 'Success',
        timestamp: new Date(),
        tokenRefreshed: tokenBefore !== tokenAfter,
      });
    } catch (error) {
      addResult({
        endpoint: name,
        success: false,
        status: 500,
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date(),
      });
    } finally {
      setIsLoading(null);
    }
  };

  // Direct API call without auto-refresh (to test expired token behavior)
  const testDirectCall = async (endpoint: string, name: string) => {
    setIsLoading(`direct-${endpoint}`);
    const accessToken = getAccessToken();

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const data = await response.json();

      addResult({
        endpoint: `${name} (Direct)`,
        success: response.ok,
        status: response.status,
        message: response.ok ? 'Success' : (data.message || response.statusText),
        timestamp: new Date(),
        tokenRefreshed: false,
      });
    } catch (error) {
      addResult({
        endpoint: `${name} (Direct)`,
        success: false,
        status: 500,
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date(),
      });
    } finally {
      setIsLoading(null);
    }
  };

  // Manual token refresh
  const manualRefresh = async () => {
    setIsLoading('refresh');
    const refreshToken = getRefreshToken();

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      const result = await response.json();

      if (response.ok) {
        const data = result.data;
        localStorage.setItem('doergo_access_token', data.accessToken);
        localStorage.setItem('doergo_refresh_token', data.refreshToken);
        loadTokenExpiry();

        addResult({
          endpoint: 'Manual Refresh',
          success: true,
          status: 200,
          message: 'Tokens refreshed successfully',
          timestamp: new Date(),
          tokenRefreshed: true,
        });
      } else {
        addResult({
          endpoint: 'Manual Refresh',
          success: false,
          status: response.status,
          message: result.message || 'Refresh failed',
          timestamp: new Date(),
        });
      }
    } catch (error) {
      addResult({
        endpoint: 'Manual Refresh',
        success: false,
        status: 500,
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date(),
      });
    } finally {
      setIsLoading(null);
    }
  };

  const clearResults = () => setResults([]);

  const testEndpoints = [
    { endpoint: '/auth/me', name: 'Get Current User', icon: User },
    { endpoint: '/users/me', name: 'Get User Profile', icon: User },
    { endpoint: '/tasks', name: 'Get Tasks', icon: ListTodo },
    { endpoint: '/tracking/workers', name: 'Get Workers Location', icon: MapPin },
  ];

  return (
    <div className="p-6 space-y-6">
        {/* Token Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Token Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Access Token */}
              <div className="p-4 rounded-lg border bg-slate-50">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium text-slate-700">Access Token</h4>
                  <div className={`flex items-center gap-2 ${timeLeft.access > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    <Timer className="h-4 w-4" />
                    <span className="font-mono text-lg font-bold">
                      {timeLeft.access > 0 ? formatTime(timeLeft.access) : 'EXPIRED'}
                    </span>
                  </div>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${timeLeft.access > 30 ? 'bg-green-500' : timeLeft.access > 0 ? 'bg-yellow-500' : 'bg-red-500'}`}
                    style={{ width: `${Math.min(100, (timeLeft.access / 60) * 100)}%` }}
                  />
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  {accessExpiry ? `Expires: ${accessExpiry.toLocaleTimeString()}` : 'No token'}
                </p>
              </div>

              {/* Refresh Token */}
              <div className="p-4 rounded-lg border bg-slate-50">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium text-slate-700">Refresh Token</h4>
                  <div className={`flex items-center gap-2 ${timeLeft.refresh > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    <Timer className="h-4 w-4" />
                    <span className="font-mono text-lg font-bold">
                      {timeLeft.refresh > 0 ? formatTime(timeLeft.refresh) : 'EXPIRED'}
                    </span>
                  </div>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${timeLeft.refresh > 60 ? 'bg-green-500' : timeLeft.refresh > 0 ? 'bg-yellow-500' : 'bg-red-500'}`}
                    style={{ width: `${Math.min(100, (timeLeft.refresh / 180) * 100)}%` }}
                  />
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  {refreshExpiry ? `Expires: ${refreshExpiry.toLocaleTimeString()}` : 'No token'}
                </p>
              </div>
            </div>

            {/* Manual Refresh Button */}
            <div className="mt-4 flex justify-center">
              <Button
                onClick={manualRefresh}
                disabled={isLoading === 'refresh'}
                variant="outline"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading === 'refresh' ? 'animate-spin' : ''}`} />
                Manual Token Refresh
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Test Endpoints */}
        <Card>
          <CardHeader>
            <CardTitle>Test API Endpoints</CardTitle>
            <p className="text-sm text-slate-500 mt-1">
              &quot;With Auto-Refresh&quot; will automatically refresh tokens if expired.
              &quot;Direct Call&quot; bypasses auto-refresh to test expired token behavior.
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {testEndpoints.map(({ endpoint, name, icon: Icon }) => (
                <div key={endpoint} className="p-4 border rounded-lg space-y-3">
                  <div className="flex items-center gap-2">
                    <Icon className="h-5 w-5 text-slate-600" />
                    <span className="font-medium">{name}</span>
                  </div>
                  <code className="text-xs text-slate-500 block">{endpoint}</code>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => testEndpoint(endpoint, name)}
                      disabled={isLoading === endpoint}
                    >
                      {isLoading === endpoint ? 'Testing...' : 'With Auto-Refresh'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => testDirectCall(endpoint, name)}
                      disabled={isLoading === `direct-${endpoint}`}
                    >
                      {isLoading === `direct-${endpoint}` ? 'Testing...' : 'Direct Call'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Results History */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Test Results</CardTitle>
              {results.length > 0 && (
                <Button size="sm" variant="secondary" onClick={clearResults}>
                  Clear
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {results.length === 0 ? (
              <p className="text-slate-500 text-center py-8">No test results yet. Click a test button above.</p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-auto">
                {results.map((result, index) => (
                  <div
                    key={index}
                    className={`p-3 rounded-lg border flex items-start gap-3 ${
                      result.success
                        ? 'bg-green-50 border-green-200'
                        : 'bg-red-50 border-red-200'
                    }`}
                  >
                    {result.success ? (
                      <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{result.endpoint}</span>
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          result.success ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'
                        }`}>
                          {result.status}
                        </span>
                        {result.tokenRefreshed && (
                          <span className="text-xs px-2 py-0.5 rounded bg-blue-200 text-blue-800 flex items-center gap-1">
                            <RefreshCw className="h-3 w-3" />
                            Token Refreshed
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-600 mt-1">{result.message}</p>
                      <p className="text-xs text-slate-400 mt-1">
                        {result.timestamp.toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Instructions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              How to Test
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal list-inside space-y-2 text-slate-600">
              <li>Watch the <strong>Access Token</strong> countdown (expires in 1 minute)</li>
              <li>While token is valid, click <strong>&quot;Direct Call&quot;</strong> - should return 200</li>
              <li>Wait for access token to expire (shows EXPIRED)</li>
              <li>Click <strong>&quot;Direct Call&quot;</strong> again - should return 401</li>
              <li>Click <strong>&quot;With Auto-Refresh&quot;</strong> - should refresh token and return 200</li>
              <li>Notice the <strong>&quot;Token Refreshed&quot;</strong> badge in results</li>
              <li>Wait for <strong>Refresh Token</strong> to expire (3 minutes total)</li>
              <li>Both calls should fail and redirect to login</li>
            </ol>
          </CardContent>
        </Card>
    </div>
  );
}
