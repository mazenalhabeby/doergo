import { useEffect } from 'react';
import {
  SocketEvents,
  type ChatAttachment,
  type ChatMessage,
  type ChatMessageChangedEvent,
  type ChatMessageEvent,
} from '@hbcfield/shared/client';
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
  const { engine, records } = useOffline();
  const { isConnected, subscribe } = useSocketContext();

  /*
    Chat keeps the phone's copy current from the socket itself — the event
    carries the message, so a pull would only fetch it again. Kept without its
    links (they expire; the thread signs fresh ones when read online).
  */
  useEffect(() => {
    if (!records || !isConnected) return;
    const keep = (d: ChatMessageEvent | ChatMessageChangedEvent | null) => {
      // As sent: an edited message also carries `updatedAt`, an attachment its `fileUrl`.
      const m = d?.message as (ChatMessage & { updatedAt?: string | null }) | undefined;
      if (!m?.id || !m.conversationId) return;
      const attachments = Array.isArray(m.attachments)
        ? (m.attachments as (ChatAttachment & { fileUrl?: string })[]).map(({ url: _u, fileUrl: _f, ...a }) => a)
        : [];
      const row = { ...m, attachments, updatedAt: m.updatedAt ?? m.createdAt };
      void records.upsert('chat_messages', row, m.conversationId).catch(() => undefined);
    };
    const offs = [subscribe(SocketEvents.CHAT_MESSAGE, keep), subscribe(SocketEvents.CHAT_MESSAGE_CHANGED, keep)];
    return () => offs.forEach((o) => o());
  }, [records, isConnected, subscribe]);

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
