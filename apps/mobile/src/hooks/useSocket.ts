/**
 * Socket.IO hook for mobile real-time updates
 *
 * Manages connection lifecycle including AppState changes
 * (disconnect on background, reconnect on foreground).
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { io, Socket } from 'socket.io-client';
import { getSocketUrl } from '../lib/socket';
import { getAccessToken } from '../lib/api';

export interface SocketUser {
  id: string;
  role: string;
  organizationId?: string | null;
}

export function useSocket(user?: SocketUser | null) {
  const socketRef = useRef<Socket | null>(null);
  const userRef = useRef(user);
  const [isConnected, setIsConnected] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Keep userRef in sync without triggering re-renders
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const connect = useCallback(async () => {
    if (socketRef.current?.connected) return;

    const currentUser = userRef.current;
    const token = await getAccessToken();
    if (!token || !currentUser) return;

    const url = getSocketUrl();

    socketRef.current = io(url, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socketRef.current.on('connect', () => {
      setIsConnected(true);

      socketRef.current?.emit('authenticate', {
        userId: currentUser.id,
        role: currentUser.role,
        organizationId: currentUser.organizationId || 'default',
      }, (response: { success: boolean }) => {
        setIsAuthenticated(response?.success || false);
      });
    });

    socketRef.current.on('disconnect', () => {
      setIsConnected(false);
      setIsAuthenticated(false);
    });

    socketRef.current.on('connect_error', () => {
      setIsConnected(false);
    });
  }, []); // No dependencies - uses refs

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
      setIsConnected(false);
      setIsAuthenticated(false);
    }
  }, []);

  const subscribe = useCallback(<T>(event: string, handler: (data: T) => void) => {
    if (!socketRef.current) return () => {};
    socketRef.current.on(event, handler);
    return () => {
      socketRef.current?.off(event, handler);
    };
  }, []);

  // Connect when user becomes available, disconnect when removed
  useEffect(() => {
    if (user) {
      connect();
    } else {
      disconnect();
    }
    return () => disconnect();
  }, [user, connect, disconnect]);

  // Handle AppState changes - disconnect on background, reconnect on foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active' && userRef.current) {
        connect();
      } else if (nextState === 'background') {
        disconnect();
      }
    });

    return () => subscription.remove();
  }, [connect, disconnect]);

  return {
    isConnected,
    isAuthenticated,
    subscribe,
    socket: socketRef.current,
  };
}
