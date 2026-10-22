import React, { createContext, useContext, useEffect, useMemo } from 'react';
import { SocketEvents } from '@hbcfield/shared/client';
import { useSocket, type SocketUser } from '../hooks/use-socket';
import { useAuth } from './auth-context';

interface SocketContextType {
  isConnected: boolean;
  isAuthenticated: boolean;
  subscribe: <T>(event: string, handler: (data: T) => void) => () => void;
  emit: (event: string, payload?: unknown) => void;
}

const SocketContext = createContext<SocketContextType>({
  isConnected: false,
  isAuthenticated: false,
  subscribe: () => () => {},
  emit: () => {},
});

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { user, refreshUser } = useAuth();

  // Memoize to prevent recreating object on every render
  const socketUser: SocketUser | null = useMemo(
    () => user ? { id: user.id, role: user.role, organizationId: user.organizationId } : null,
    [user?.id, user?.role, user?.organizationId],
  );

  const { isConnected, isAuthenticated, subscribe, emit } = useSocket(socketUser);

  // When an admin changes THIS member's access/role, re-fetch the profile so the
  // visible tabs/screens re-render in place — no reload, no waiting for the next
  // foreground resume. Re-subscribes once the socket is authenticated.
  useEffect(() => {
    if (!isAuthenticated) return;
    return subscribe(SocketEvents.MEMBER_ACCESS_UPDATED, () => { void refreshUser(); });
  }, [isAuthenticated, subscribe, refreshUser]);

  // ⚠️ Stable: a fresh object re-rendered every subscriber each time the app layout rendered.
  const value = useMemo(() => ({ isConnected, isAuthenticated, subscribe, emit }), [isConnected, isAuthenticated, subscribe, emit]);

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocketContext() {
  return useContext(SocketContext);
}
