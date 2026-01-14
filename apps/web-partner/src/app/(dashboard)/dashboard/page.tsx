'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, Button } from '@/components/ui';
import { ClipboardList, Clock, CheckCircle, AlertCircle, RefreshCw, Key, Timer } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { getAccessToken, getRefreshToken } from '@/lib/api';

const stats = [
  {
    name: 'Total Tasks',
    value: '24',
    icon: ClipboardList,
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
  },
  {
    name: 'In Progress',
    value: '8',
    icon: Clock,
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
  },
  {
    name: 'Completed',
    value: '14',
    icon: CheckCircle,
    color: 'text-green-600',
    bgColor: 'bg-green-100',
  },
  {
    name: 'Pending',
    value: '2',
    icon: AlertCircle,
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-100',
  },
];

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

function TokenTestBox() {
  const { refreshUser } = useAuth();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [accessExpiry, setAccessExpiry] = useState<Date | null>(null);
  const [refreshExpiry, setRefreshExpiry] = useState<Date | null>(null);
  const [timeLeft, setTimeLeft] = useState({ access: 0, refresh: 0 });
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Load tokens
  const loadTokens = () => {
    const access = getAccessToken();
    const refresh = getRefreshToken();
    setAccessToken(access);
    setRefreshToken(refresh);

    if (access) {
      const decoded = decodeJwt(access);
      if (decoded?.exp) {
        setAccessExpiry(new Date(decoded.exp * 1000));
      }
    }

    if (refresh) {
      const decoded = decodeJwt(refresh);
      if (decoded?.exp) {
        setRefreshExpiry(new Date(decoded.exp * 1000));
      }
    }
  };

  useEffect(() => {
    loadTokens();
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

  // Test API call
  const testApiCall = async () => {
    setTestResult(null);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/me`, {
        headers: {
          Authorization: `Bearer ${getAccessToken()}`,
        },
      });
      const data = await response.json();
      if (response.ok) {
        setTestResult({ success: true, message: `API call successful! User: ${data.data.email}` });
      } else {
        setTestResult({ success: false, message: `API call failed: ${data.message || response.statusText}` });
      }
    } catch (error) {
      setTestResult({ success: false, message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` });
    }
  };

  // Manual refresh token
  const manualRefresh = async () => {
    setIsRefreshing(true);
    setTestResult(null);
    try {
      const currentRefreshToken = getRefreshToken();
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: currentRefreshToken }),
      });
      const result = await response.json();
      if (response.ok) {
        // API returns { success: true, data: { accessToken, refreshToken } }
        const data = result.data;
        // Update tokens in storage
        localStorage.setItem('doergo_access_token', data.accessToken);
        localStorage.setItem('doergo_refresh_token', data.refreshToken);
        loadTokens();
        setTestResult({ success: true, message: 'Tokens refreshed successfully!' });
      } else {
        setTestResult({ success: false, message: `Refresh failed: ${result.message || response.statusText}` });
      }
    } catch (error) {
      setTestResult({ success: false, message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` });
    } finally {
      setIsRefreshing(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Key className="h-5 w-5" />
          Token Testing Box
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Access Token */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-slate-700">Access Token</h4>
              <div className={`flex items-center gap-2 ${timeLeft.access > 0 ? 'text-green-600' : 'text-red-600'}`}>
                <Timer className="h-4 w-4" />
                <span className="font-mono text-sm">
                  {timeLeft.access > 0 ? formatTime(timeLeft.access) : 'EXPIRED'}
                </span>
              </div>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border">
              <code className="text-xs text-slate-600 break-all block max-h-20 overflow-auto">
                {accessToken ? `${accessToken.substring(0, 50)}...` : 'No token'}
              </code>
            </div>
            {accessExpiry && (
              <p className="text-xs text-slate-500">
                Expires: {accessExpiry.toLocaleTimeString()}
              </p>
            )}
          </div>

          {/* Refresh Token */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-slate-700">Refresh Token</h4>
              <div className={`flex items-center gap-2 ${timeLeft.refresh > 0 ? 'text-green-600' : 'text-red-600'}`}>
                <Timer className="h-4 w-4" />
                <span className="font-mono text-sm">
                  {timeLeft.refresh > 0 ? formatTime(timeLeft.refresh) : 'EXPIRED'}
                </span>
              </div>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border">
              <code className="text-xs text-slate-600 break-all block max-h-20 overflow-auto">
                {refreshToken ? `${refreshToken.substring(0, 50)}...` : 'No token'}
              </code>
            </div>
            {refreshExpiry && (
              <p className="text-xs text-slate-500">
                Expires: {refreshExpiry.toLocaleTimeString()}
              </p>
            )}
          </div>
        </div>

        {/* Test Actions */}
        <div className="mt-6 flex flex-wrap gap-3">
          <Button onClick={testApiCall} variant="outline" size="sm">
            Test API Call (/auth/me)
          </Button>
          <Button onClick={manualRefresh} variant="outline" size="sm" disabled={isRefreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh Tokens
          </Button>
          <Button onClick={loadTokens} variant="secondary" size="sm">
            Reload Tokens
          </Button>
        </div>

        {/* Test Result */}
        {testResult && (
          <div
            className={`mt-4 p-3 rounded-lg border ${
              testResult.success
                ? 'bg-green-50 border-green-200 text-green-700'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}
          >
            <p className="text-sm">{testResult.message}</p>
          </div>
        )}

        {/* Info */}
        <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
          <p className="text-sm text-blue-700">
            <strong>Testing Mode:</strong> Access token expires in 1 minute, refresh token in 3 minutes.
            Watch the countdown and test the automatic refresh behavior!
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();

  return (
    <div className="p-6">
        {/* Welcome */}
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-slate-800">
            Welcome back, {user?.firstName}!
          </h2>
          <p className="text-slate-500 mt-1">
            Here&apos;s an overview of your tasks and activities.
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {stats.map((stat) => (
            <Card key={stat.name}>
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-lg ${stat.bgColor}`}>
                    <stat.icon className={`h-6 w-6 ${stat.color}`} />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">{stat.name}</p>
                    <p className="text-2xl font-semibold text-slate-800">{stat.value}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

      {/* Token Test Box */}
      <TokenTestBox />
    </div>
  );
}
