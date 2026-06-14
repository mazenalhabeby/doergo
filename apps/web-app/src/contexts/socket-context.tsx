"use client"

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react"
import { io, Socket } from "socket.io-client"
import { useAuth } from "./auth-context"
import { getAccessToken } from "@/lib/api"

// ============================================================================
// Singleton Socket — ONE connection for the entire app
// ============================================================================

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:4001"

interface SocketContextValue {
  isConnected: boolean
  subscribe: (event: string, handler: (data: any) => void) => () => void
}

const SocketContext = createContext<SocketContextValue>({
  isConnected: false,
  subscribe: () => () => {},
})

export function useSocketContext() {
  return useContext(SocketContext)
}

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
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
      auth: { token: accessToken },
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

  // Stable subscribe function — doesn't change on re-renders
  const subscribe = useCallback((event: string, handler: (data: any) => void) => {
    const socket = socketRef.current
    if (!socket) return () => {}

    socket.on(event, handler)
    return () => { socket.off(event, handler) }
  }, []) // Empty deps — uses ref which is always current

  return (
    <SocketContext.Provider value={{ isConnected, subscribe }}>
      {children}
    </SocketContext.Provider>
  )
}
