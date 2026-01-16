'use client';

import { useState, useMemo } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { RefreshCw, ChevronDown, ChevronUp, Clock, Key, AlertTriangle, CheckCircle, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';

// Parse JWT to get iat (issued at) and exp (expiry) claims
function parseJwt(token: string | null): { iat?: number; exp?: number } | null {
  if (!token) return null;
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

// Format duration in human readable format
function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

export function TokenDisplay() {
  const { tokenInfo, manualRefresh, isAuthenticated } = useAuth();
  const [isExpanded, setIsExpanded] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Parse tokens to get total duration
  const tokenDurations = useMemo(() => {
    const accessPayload = parseJwt(tokenInfo.accessToken);
    const refreshPayload = parseJwt(tokenInfo.refreshToken);

    const accessDuration = accessPayload?.iat && accessPayload?.exp
      ? accessPayload.exp - accessPayload.iat
      : 900; // default 15min
    const refreshDuration = refreshPayload?.iat && refreshPayload?.exp
      ? refreshPayload.exp - refreshPayload.iat
      : 604800; // default 7d

    return { accessDuration, refreshDuration };
  }, [tokenInfo.accessToken, tokenInfo.refreshToken]);

  if (!isAuthenticated) return null;

  const now = new Date();

  // Calculate time remaining
  const getTimeRemaining = (expDate: Date | null) => {
    if (!expDate) return { seconds: 0, isExpired: true };
    const diff = expDate.getTime() - now.getTime();
    const seconds = Math.max(0, Math.floor(diff / 1000));
    return { seconds, isExpired: diff <= 0 };
  };

  const accessRemaining = getTimeRemaining(tokenInfo.accessTokenExp);
  const refreshRemaining = getTimeRemaining(tokenInfo.refreshTokenExp);

  // Format time as MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Truncate token for display
  const truncateToken = (token: string | null) => {
    if (!token) return 'N/A';
    return `${token.slice(0, 20)}...${token.slice(-10)}`;
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await manualRefresh();
    setIsRefreshing(false);
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 w-96">
      <div className="bg-slate-900 text-white rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-between px-4 py-3 bg-slate-800 hover:bg-slate-700 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Key className="size-4 text-blue-400" />
            <span className="font-semibold text-sm">Token Monitor</span>
            <span className="flex items-center gap-1 text-xs text-green-400">
              <Shield className="size-3" />
              OAuth 2.0
            </span>
          </div>
          {isExpanded ? (
            <ChevronDown className="size-4 text-slate-400" />
          ) : (
            <ChevronUp className="size-4 text-slate-400" />
          )}
        </button>

        {isExpanded && (
          <div className="p-4 space-y-4">
            {/* Access Token */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">Access Token</span>
                <div className="flex items-center gap-2">
                  {accessRemaining.isExpired ? (
                    <span className="flex items-center gap-1 text-red-400 text-xs">
                      <AlertTriangle className="size-3" />
                      Expired
                    </span>
                  ) : (
                    <span className={cn(
                      "flex items-center gap-1 text-xs font-mono",
                      accessRemaining.seconds <= 10 ? "text-red-400" :
                      accessRemaining.seconds <= 30 ? "text-amber-400" : "text-green-400"
                    )}>
                      <Clock className="size-3" />
                      {formatTime(accessRemaining.seconds)}
                    </span>
                  )}
                </div>
              </div>
              <div className="bg-slate-800 rounded-lg p-2">
                <code className="text-xs text-slate-300 break-all">
                  {truncateToken(tokenInfo.accessToken)}
                </code>
              </div>
              {/* Progress bar */}
              <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full transition-all duration-1000",
                    accessRemaining.seconds <= 10 ? "bg-red-500" :
                    accessRemaining.seconds <= 30 ? "bg-amber-500" : "bg-green-500"
                  )}
                  style={{ width: `${Math.min(100, (accessRemaining.seconds / tokenDurations.accessDuration) * 100)}%` }}
                />
              </div>
              <p className="text-xs text-slate-500">Total duration: {formatDuration(tokenDurations.accessDuration)}</p>
            </div>

            {/* Refresh Token */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">Refresh Token</span>
                <div className="flex items-center gap-2">
                  {refreshRemaining.isExpired ? (
                    <span className="flex items-center gap-1 text-red-400 text-xs">
                      <AlertTriangle className="size-3" />
                      Expired
                    </span>
                  ) : (
                    <span className={cn(
                      "flex items-center gap-1 text-xs font-mono",
                      refreshRemaining.seconds <= 30 ? "text-red-400" :
                      refreshRemaining.seconds <= 60 ? "text-amber-400" : "text-green-400"
                    )}>
                      <Clock className="size-3" />
                      {formatTime(refreshRemaining.seconds)}
                    </span>
                  )}
                </div>
              </div>
              <div className="bg-slate-800 rounded-lg p-2">
                <code className="text-xs text-slate-300 break-all">
                  {truncateToken(tokenInfo.refreshToken)}
                </code>
              </div>
              {/* Progress bar */}
              <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full transition-all duration-1000",
                    refreshRemaining.seconds <= 30 ? "bg-red-500" :
                    refreshRemaining.seconds <= 60 ? "bg-amber-500" : "bg-green-500"
                  )}
                  style={{ width: `${Math.min(100, (refreshRemaining.seconds / tokenDurations.refreshDuration) * 100)}%` }}
                />
              </div>
              <p className="text-xs text-slate-500">Total duration: {formatDuration(tokenDurations.refreshDuration)}</p>
            </div>

            {/* Status */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-700">
              <div className="flex items-center gap-2">
                {refreshRemaining.isExpired ? (
                  <span className="flex items-center gap-1 text-xs text-red-400">
                    <AlertTriangle className="size-3" />
                    Session Expired - Re-login
                  </span>
                ) : accessRemaining.isExpired ? (
                  <span className="flex items-center gap-1 text-xs text-amber-400">
                    <AlertTriangle className="size-3" />
                    Access Expired - Will refresh on next API call
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-green-400">
                    <CheckCircle className="size-3" />
                    Tokens Valid
                  </span>
                )}
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-3 text-xs bg-transparent border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white"
                onClick={handleRefresh}
                disabled={isRefreshing || refreshRemaining.isExpired}
              >
                <RefreshCw className={cn("size-3 mr-1.5", isRefreshing && "animate-spin")} />
                Manual Refresh
              </Button>
            </div>

            {/* Info */}
            <div className="text-xs text-slate-500 pt-2 border-t border-slate-700">
              <p>Access: {formatDuration(tokenDurations.accessDuration)} | Refresh: {formatDuration(tokenDurations.refreshDuration)}</p>
              <p className="text-green-400">
                OAuth 2.0: Auto-refresh on 401 response
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
