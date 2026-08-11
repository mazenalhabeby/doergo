"use client"

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react"
import { io, Socket } from "socket.io-client"
import { useTranslation } from "react-i18next"
import { SocketEvents } from "@hbcfield/shared/client"
import { useAuth } from "./auth-context"
import { getAccessToken } from "@/lib/api"
import { notify } from "@/lib/toast"

// ============================================================================
// Singleton Socket — ONE connection for the entire app
// ============================================================================

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:4001"

interface SocketContextValue {
  isConnected: boolean
  subscribe: (event: string, handler: (data: any) => void) => () => void
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

    const socket = io(SOCKET_URL, {
      // Function form: socket.io re-invokes this on every (re)connect, so a
      // reconnect after the ~15-min access-token refresh sends the CURRENT token
      // instead of the stale one captured at mount — otherwise all realtime
      // updates silently die after the first post-expiry reconnect. (Sec audit H9.)
      auth: (cb: (data: { token: string | null }) => void) => cb({ token: getAccessToken() }),
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 30000,
    })

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
  const subscribe = useCallback((event: string, handler: (data: any) => void) => {
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
