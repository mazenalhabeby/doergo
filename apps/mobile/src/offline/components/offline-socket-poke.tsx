import { useEffect } from 'react';
import { SocketEvents } from '@hbcfield/shared/client';
import { useSocketContext } from '../../contexts/socket-context';
import { useOffline } from '../offline-context';
import { createPoke } from '../socket-poke';

/** Task events the phone's copy cares about. */
const TASK_EVENTS = [
  SocketEvents.TASK_CREATED,
  SocketEvents.TASK_UPDATED,
  SocketEvents.TASK_ASSIGNED,
  SocketEvents.TASK_STATUS_CHANGED,
  SocketEvents.TASK_COMMENT_ADDED,
] as const;

/**
 * The app's one listener that turns live task events into a pull. Renders
 * nothing; mounted inside the socket provider. See socket-poke.ts.
 */
export function OfflineSocketPoke() {
  const { engine } = useOffline();
  const { isConnected, subscribe } = useSocketContext();

  useEffect(() => {
    if (!engine || !isConnected) return;
    const poke = createPoke(() => engine.pull('tasks'));
    const unsubs = TASK_EVENTS.filter(Boolean).map((event) => subscribe(event, () => poke.poke()));
    return () => {
      unsubs.forEach((u) => u());
      poke.cancel();
    };
  }, [engine, isConnected, subscribe]);

  return null;
}
