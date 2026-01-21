/**
 * Socket.IO client for real-time updates
 *
 * Connects to the notification service via the API gateway
 * for real-time events like worker location updates.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { getAccessToken } from './api';

// Socket.IO connects to notification service (not API gateway)
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:4001';

// Socket.IO event types
export interface WorkerLocationUpdate {
  workerId: string;
  taskId?: string;
  location: {
    lat: number;
    lng: number;
    accuracy?: number;
    timestamp: Date;
  };
}

export interface TaskUpdate {
  task: {
    id: string;
    status: string;
    title: string;
  };
  previousStatus?: string;
  newStatus?: string;
}

// Socket event names
export const SocketEvents = {
  WORKER_LOCATION_UPDATED: 'worker.locationUpdated',
  TASK_CREATED: 'task.created',
  TASK_UPDATED: 'task.updated',
  TASK_ASSIGNED: 'task.assigned',
  TASK_STATUS_CHANGED: 'task.statusChanged',
} as const;

type SocketEventName = typeof SocketEvents[keyof typeof SocketEvents];

// User info for socket authentication
export interface SocketUser {
  id: string;
  role: string;
  organizationId?: string;
}

/**
 * Hook for connecting to Socket.IO and subscribing to events
 */
export function useSocket(user?: SocketUser | null) {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // Connect to socket
  const connect = useCallback(() => {
    if (socketRef.current?.connected) return;

    const token = getAccessToken();
    if (!token) {
      setConnectionError('No auth token available');
      return;
    }

    console.log('[Socket] Connecting to', SOCKET_URL);

    socketRef.current = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socketRef.current.on('connect', () => {
      console.log('[Socket] Connected, socket id:', socketRef.current?.id);
      setIsConnected(true);
      setConnectionError(null);

      // Authenticate with user info if available
      if (user && socketRef.current) {
        console.log('[Socket] Authenticating as', user.role);
        socketRef.current.emit('authenticate', {
          userId: user.id,
          role: user.role,
          organizationId: user.organizationId || 'default',
        }, (response: { success: boolean }) => {
          console.log('[Socket] Auth response:', response);
          setIsAuthenticated(response?.success || false);
        });
      }
    });

    socketRef.current.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
      setIsConnected(false);
      setIsAuthenticated(false);
    });

    socketRef.current.on('connect_error', (error) => {
      console.error('[Socket] Connection error:', error.message);
      setConnectionError(error.message);
      setIsConnected(false);
    });
  }, [user]);

  // Disconnect from socket
  const disconnect = useCallback(() => {
    if (socketRef.current) {
      console.log('[Socket] Disconnecting');
      socketRef.current.disconnect();
      socketRef.current = null;
      setIsConnected(false);
    }
  }, []);

  // Subscribe to an event
  const subscribe = useCallback(<T>(event: SocketEventName, handler: (data: T) => void) => {
    if (!socketRef.current) {
      console.warn('[Socket] Cannot subscribe - not connected');
      return () => {};
    }

    console.log('[Socket] Subscribing to', event);
    socketRef.current.on(event, handler);

    return () => {
      console.log('[Socket] Unsubscribing from', event);
      socketRef.current?.off(event, handler);
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    isConnected,
    isAuthenticated,
    connectionError,
    connect,
    disconnect,
    subscribe,
    socket: socketRef.current,
  };
}

/**
 * Hook specifically for worker location updates
 * Handles connection and reconnection automatically
 */
export function useWorkerLocationUpdates(
  onLocationUpdate: (update: WorkerLocationUpdate) => void,
  user: SocketUser | null,
  enabled = true
) {
  const { isConnected, isAuthenticated, connectionError, connect, disconnect, subscribe } = useSocket(user);

  useEffect(() => {
    if (!enabled || !user) {
      disconnect();
      return;
    }

    connect();
  }, [enabled, user, connect, disconnect]);

  useEffect(() => {
    if (!isConnected || !enabled) return;

    const unsubscribe = subscribe<WorkerLocationUpdate>(
      SocketEvents.WORKER_LOCATION_UPDATED,
      onLocationUpdate
    );

    return unsubscribe;
  }, [isConnected, enabled, subscribe, onLocationUpdate]);

  return { isConnected, isAuthenticated, connectionError };
}
