"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/contexts/auth-context"
import { cn } from "@/lib/utils"

// Decode a JWT's iat/exp (no verification — display only).
function decodeIatExp(token?: string | null): { iat?: number; exp?: number } {
  if (!token) return {}
  try {
    const part = token.split(".")[1]
    if (!part) return {}
    const json = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")))
    return { iat: json.iat, exp: json.exp }
  } catch {
    return {}
  }
}

export function TokenDebugPanel() {
  const { tokenInfo, manualRefresh, isAuthenticated } = useAuth()
  const [now, setNow] = useState(Date.now())
  const [refreshing, setRefreshing] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)

  // Update every second for countdown
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [])

  if (!isAuthenticated) return null

  const accessExp = tokenInfo.accessTokenExp?.getTime() ?? 0
  const accessRemaining = Math.max(0, Math.floor((accessExp - now) / 1000))
  const accessMinutes = Math.floor(accessRemaining / 60)
  const accessSeconds = accessRemaining % 60
  const accessExpired = accessRemaining <= 0

  // Total token lifetime (exp − iat) drives the progress bar so it's accurate
  // for ANY JWT_ACCESS_EXPIRATION (1m, 15m, …), not a hardcoded 15m.
  const { iat, exp } = decodeIatExp(tokenInfo.accessToken)
  const totalLifetime = iat && exp && exp > iat ? exp - iat : 900
  // Warn in the last 20% of the token's life (capped at 2 min for long tokens).
  const warnThreshold = Math.min(120, Math.ceil(totalLifetime * 0.2))
  const accessWarning = accessRemaining > 0 && accessRemaining < warnThreshold

  const handleRefresh = async () => {
    setRefreshing(true)
    const ok = await manualRefresh()
    setLastRefresh(ok ? "Success" : "Failed")
    setRefreshing(false)
    setTimeout(() => setLastRefresh(null), 3000)
  }

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className={cn(
          "fixed bottom-4 right-4 z-50 size-10 rounded-full shadow-lg flex items-center justify-center text-xs font-bold border",
          accessExpired
            ? "bg-red-500 text-white border-red-600"
            : accessWarning
              ? "bg-amber-500 text-white border-amber-600 animate-pulse"
              : "bg-green-500 text-white border-green-600",
        )}
        title="Token Debug"
      >
        {accessExpired ? "!" : `${accessMinutes}m`}
      </button>
    )
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-64 bg-card border border-border rounded-xl shadow-2xl overflow-hidden text-xs">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-muted/50 border-b border-border">
        <span className="font-semibold text-foreground">Token Monitor</span>
        <button onClick={() => setCollapsed(true)} className="text-muted-foreground hover:text-foreground text-[10px]">
          minimize
        </button>
      </div>

      <div className="p-3 space-y-2.5">
        {/* Access Token */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-muted-foreground">Access Token</span>
            <span className={cn(
              "font-mono font-bold tabular-nums",
              accessExpired ? "text-red-500" : accessWarning ? "text-amber-500" : "text-green-500",
            )}>
              {accessExpired ? "EXPIRED" : `${accessMinutes}:${String(accessSeconds).padStart(2, "0")}`}
            </span>
          </div>
          {/* Progress bar */}
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-1000",
                accessExpired ? "bg-red-500" : accessWarning ? "bg-amber-500" : "bg-green-500",
              )}
              style={{ width: `${Math.min(100, (accessRemaining / totalLifetime) * 100)}%` }}
            />
          </div>
        </div>

        {/* Expiry time */}
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-muted-foreground">Expires at</span>
          <span className="font-mono text-foreground">
            {tokenInfo.accessTokenExp ? tokenInfo.accessTokenExp.toLocaleTimeString() : "—"}
          </span>
        </div>

        {/* Token preview */}
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-muted-foreground">Token</span>
          <span className="font-mono text-foreground truncate max-w-[140px]">
            {tokenInfo.accessToken ? `...${tokenInfo.accessToken.slice(-12)}` : "none"}
          </span>
        </div>

        {/* Refresh status */}
        {lastRefresh && (
          <div className={cn(
            "text-[10px] font-medium text-center py-1 rounded",
            lastRefresh === "Success" ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-500",
          )}>
            Refresh: {lastRefresh}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-1.5 pt-1">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex-1 h-7 rounded-lg bg-blue-600 text-white text-[11px] font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {refreshing ? "Refreshing..." : "Force Refresh"}
          </button>
        </div>
      </div>
    </div>
  )
}
