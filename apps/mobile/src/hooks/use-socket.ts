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
import { getAccessToken, getFreshAccessToken } from '../lib/api';
import { loadNetInfo } from '../offline/native';

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
  const lastRetry = useRef(0);
  /*
    ⚠️ HANDLERS BELONG TO THE APP, NOT TO ONE SOCKET OBJECT.

    `subscribe` used to bind to whichever socket existed at that moment. When the
    app came back to the front while the socket was reconnecting (every token
    renewal), `connect()` built a NEW socket — without resetting "authenticated",
    so no effect re-ran and every listener stayed on the dead one. Screens that
    remount (the Messages list) recovered; the always-mounted ones (the chat
    badge, the global notifier) went deaf until the app restarted. Now one
    dispatcher per socket hands every event to this registry.
  */
  const handlers = useRef(new Map<string, Set<(data: unknown) => void>>());

  // Keep userRef in sync without triggering re-renders
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  /*
    ⚠️ ONE CONNECTION ATTEMPT AT A TIME. Sign-in, the app coming to the front and
    NetInfo's first report all asked to connect in the same instant; each awaited
    the token, and two sockets were built. The first one's handlers then acted on
    the second (they read `socketRef.current`), and when the server dropped the
    unauthenticated duplicate its 'disconnect' set "not authenticated" for the app
    — while the live socket was fine. Every always-mounted listener (the chat
    badge, the in-app notifier) is gated on that flag, so they all went quiet.
  */
  const connecting = useRef<Promise<void> | null>(null);

  const connect = useCallback(() => {
    if (socketRef.current?.connected) return Promise.resolve();
    if (connecting.current) return connecting.current;
    connecting.current = open().finally(() => {
      connecting.current = null;
    });
    return connecting.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const open = async () => {
    // Tear down any lingering socket (disconnected but still auto-reconnecting
    // after a connect_error). The old `connected`-only guard let a foreground
    // transition spin up a SECOND io() while the first kept retrying → duplicate
    // managers accumulating across background/foreground cycles. (Sec audit H9.)
    if (socketRef.current) {
      socketRef.current.removeAllListeners();
      socketRef.current.disconnect();
      socketRef.current = null;
      // The old socket's 'disconnect' listener is gone, so say it here.
      setIsConnected(false);
      setIsAuthenticated(false);
    }

    const currentUser = userRef.current;
    const token = await getAccessToken();
    if (!token || !currentUser) return;

    const url = getSocketUrl();

    const sock = io(url, {
      // Function form: re-invoked on every (re)connect, so a reconnect after the
      // ~15-min access-token refresh sends the CURRENT token instead of the stale
      // one captured at connect — otherwise all reconnects fail auth. (H9.)
      // ⚠️ A FRESH token (refreshed first when it lapses within 30 s): the server
      // cycles the socket at token expiry, and the stored token is the expired one.
      auth: (cb: (data: { token: string | null }) => void) => {
        getFreshAccessToken(30).then(
          (t) => cb({ token: t }),
          () => getAccessToken().then((t) => cb({ token: t })),
        );
      },
      transports: ['websocket', 'polling'],
      reconnection: true,
      /*
        ⚠️ Never give up while the app is open. Five attempts (~20 s) meant any
        server restart (every deploy) or a dropped signal left the phone deaf to
        live updates until it was backgrounded — a message from the web showed
        only after a manual refresh. The web has always retried forever.
      */
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 15000,
    });
    socketRef.current = sock;
    // Every handler below acts on ITS OWN socket, and only while it is the current one.
    const current = () => socketRef.current === sock;

    sock.onAny((event: string, data: unknown) => {
      if (!current()) return;
      const set = handlers.current.get(event);
      // One failing screen must not starve the others of the same event.
      if (set)
        for (const h of [...set]) {
          try {
            h(data);
          } catch {
            /* that screen's own problem */
          }
        }
    });

    sock.on('connect', () => {
      if (!current()) return;
      setIsConnected(true);

      sock.emit(
        'authenticate',
        {
          userId: currentUser.id,
          role: currentUser.role,
          organizationId: currentUser.organizationId || 'default',
        },
        (response: { success: boolean }) => {
          if (!current()) return;
          const ok = response?.success || false;
          setIsAuthenticated(ok);
          // Refused (an expired token slipped through): refresh and reconnect once, not every time.
          if (!ok && Date.now() - lastRetry.current > 30_000) {
            lastRetry.current = Date.now();
            void getFreshAccessToken(600).then(() => {
              if (current()) {
                sock.disconnect();
                sock.connect();
              }
            });
          }
        },
      );
    });

    // The server says this socket's token ran out: it is about to cycle the
    // transport — have a fresh token ready for the reconnect.
    sock.on('session_expired', () => {
      if (current()) void getFreshAccessToken(600);
    });

    sock.on('disconnect', (reason: string) => {
      if (!current()) return;
      setIsConnected(false);
      setIsAuthenticated(false);
      // ⚠️ After a SERVER-side disconnect socket.io never reconnects by itself (the
      // server drops a socket that did not authenticate in time). Get a fresh token
      // and reconnect — while the app is in front.
      if (reason === 'io server disconnect' && userRef.current && AppState.currentState === 'active') {
        void getFreshAccessToken(600).then(() => {
          if (current()) sock.connect();
        });
      }
    });

    sock.on('connect_error', () => {
      if (current()) setIsConnected(false);
    });
  };

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
      setIsConnected(false);
      setIsAuthenticated(false);
    }
  }, []);

  const subscribe = useCallback(<T>(event: string, handler: (data: T) => void) => {
    let set = handlers.current.get(event);
    if (!set) {
      set = new Set();
      handlers.current.set(event, set);
    }
    const h = handler as (data: unknown) => void;
    set.add(h);
    return () => {
      set!.delete(h);
    };
  }, []);

  // Fire-and-forget emit (typing indicators etc.). No-op if not connected.
  const emit = useCallback((event: string, payload?: unknown) => {
    socketRef.current?.emit(event, payload);
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

  // The network came back (tunnel, lift, airplane mode): reconnect now rather than at the next back-off step.
  useEffect(() => {
    const netinfo = loadNetInfo();
    if (!netinfo) return;
    return netinfo.default.addEventListener((s) => {
      if (
        s.isConnected &&
        userRef.current &&
        !socketRef.current?.connected &&
        !connecting.current &&
        AppState.currentState === 'active'
      ) {
        if (socketRef.current) socketRef.current.connect();
        else void connect();
      }
    });
  }, [connect]);

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
    emit,
    socket: socketRef.current,
  };
}
