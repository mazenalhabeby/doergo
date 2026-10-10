"use client"

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react"
import { io, Socket } from "socket.io-client"
import { useTranslation } from "react-i18next"
import { SocketEvents } from "@hbcfield/shared/client"
import { useAuth } from "./auth-context"
import { getAccessToken, getFreshAccessToken } from "@/lib/auth-session"
import { SOCKET_URL } from "@/lib/endpoints"
import { notify } from "@/lib/toast"

// ============================================================================
// Singleton Socket — ONE connection for the entire app
// ============================================================================

// Where: the one endpoints module (same origin in production, never localhost).

interface SocketContextValue {
  isConnected: boolean
  /**
   * Listen for a server event.
   *
   * Generic, and unknown by default: every event carries a different shape, so
   * the payload type belongs at the call site that knows which event it asked
   * for. `any` here made all of them unchecked at once.
   */
  subscribe: <T = unknown>(event: string, handler: (data: T) => void) => () => void
  emit: (event: string, payload?: unknown) => void
}

const SocketContext = createContext<SocketContextValue>({
  isConnected: false,
  subscribe: () => () => {},
  emit: () => {},
})

export function useSocketContext() {
  return useContext(SocketContext)
}

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { user, refreshUser } = useAuth()
  const { t } = useTranslation()
  const socketRef = useRef<Socket | null>(null)
  const [isConnected, setIsConnected] = useState(false)

  // Connect once when user is available
  useEffect(() => {
    if (!user) return

    // Don't reconnect if already connected
    if (socketRef.current?.connected) return

    const accessToken = getAccessToken()
    if (!accessToken) return

    const options = {
      // Function form: socket.io re-invokes this on every (re)connect. It asks
      // for a token good for the next 30 s — refreshing first if the one in
      // memory is about to expire — so a reconnect after a laptop slept never
      // presents a stale token and silently loses realtime. (Sec audit H9.)
      auth: (cb: (data: { token: string | null }) => void) => {
        getFreshAccessToken(30)
          .then((token) => cb({ token }))
          .catch(() => cb({ token: getAccessToken() }))
      },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 30000,
    }
    // No URL = the page's own origin (production serves /socket.io/ there).
    const socket = SOCKET_URL ? io(SOCKET_URL, options) : io(options)

    socket.on("connect", () => {
      setIsConnected(true)
      // Authenticate with user info
      socket.emit("authenticate", {
        userId: user.id,
        role: user.role,
        organizationId: user.organizationId || "default",
      })
    })

    socket.on("disconnect", () => setIsConnected(false))
    socket.on("connect_error", () => setIsConnected(false))

    socketRef.current = socket

    return () => {
      socket.disconnect()
      socketRef.current = null
      setIsConnected(false)
    }
  }, [user?.id, user?.role, user?.organizationId]) // Only reconnect if user identity changes

  // When an admin changes THIS member's access/role, re-fetch the profile so
  // nav + gated screens re-render in place — no reload, no re-login. Re-attaches
  // across reconnects (isConnected toggles → effect re-runs on the fresh socket).
  useEffect(() => {
    if (!isConnected) return
    const socket = socketRef.current
    if (!socket) return
    const handler = () => {
      void refreshUser()
      notify.success(t("toast.accessUpdated", "Your access was updated"))
    }
    socket.on(SocketEvents.MEMBER_ACCESS_UPDATED, handler)
    return () => { socket.off(SocketEvents.MEMBER_ACCESS_UPDATED, handler) }
  }, [isConnected, refreshUser, t])

  // Stable subscribe function — doesn't change on re-renders
  const subscribe = useCallback(<T,>(event: string, handler: (data: T) => void) => {
    const socket = socketRef.current
    if (!socket) return () => {}

    socket.on(event, handler)
    return () => { socket.off(event, handler) }
  }, []) // Empty deps — uses ref which is always current

  // Fire-and-forget emit (typing indicators etc.). No-op if not connected.
  const emit = useCallback((event: string, payload?: unknown) => {
    socketRef.current?.emit(event, payload)
  }, [])

  return (
    <SocketContext.Provider value={{ isConnected, subscribe, emit }}>
      {children}
    </SocketContext.Provider>
  )
}
