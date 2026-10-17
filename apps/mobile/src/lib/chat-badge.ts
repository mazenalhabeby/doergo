import { useSyncExternalStore } from 'react';
import { chatApi } from './api';

/**
 * The unread total for the Team tab — one number for the whole app.
 *
 * Set by the socket (each `chat.message` carries the person's own total, and a
 * read on another screen sends `chat.badge`) and asked of the server only when
 * the socket may have missed something: on sign-in and on the app's resume.
 * Never by loading the conversation list to add it up.
 */
let total = 0;
/** Whose number this is — another person signing in on this phone never sees the last one's. */
let owner: string | null = null;
const listeners = new Set<() => void>();

export function setChatBadge(next: number): void {
  if (!Number.isInteger(next) || next < 0 || next === total) return;
  total = next;
  for (const l of listeners) l();
}

export function chatBadge(): number {
  return total;
}

/** Ask the server once (sign-in, reconnect, resume). A failure keeps the last number — of the same person. */
export async function refreshChatBadge(userId: string | null | undefined): Promise<void> {
  if (owner !== (userId ?? null)) {
    owner = userId ?? null;
    setChatBadge(0);
  }
  if (!userId) return;
  try {
    setChatBadge((await chatApi.badge()).total);
  } catch {
    /* offline or signed out: the last number stays until the socket says otherwise */
  }
}

/**
 * THE way the phone marks a conversation read: the server answers with the true
 * unread total and the badge takes it — so reading always corrects a badge that
 * drifted, whatever the socket did or missed. Offline: nothing changes, and the
 * next read or resume sets it.
 */
export async function markConversationRead(conversationId: string): Promise<void> {
  try {
    const r = await chatApi.markRead(conversationId);
    if (r && Number.isInteger(r.total)) setChatBadge(r.total);
  } catch {
    /* offline: the next read, reconnect or resume corrects it */
  }
}

export function useChatBadge(): number {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    chatBadge,
    chatBadge,
  );
}
