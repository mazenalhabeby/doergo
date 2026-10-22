import type { TFunction } from 'i18next';
import {
  conversationTitle,
  readState,
  receiptLabel,
  type ChatConversation,
  type ChatMessage,
} from '@hbcfield/shared/client';
import type { Receipt } from './chat-rows';

/** Pure pieces of `ChatScreen` — moved here unchanged. */

/** Under the newest message of mine only: sent, read, or seen by how many. */
export function receiptFor(
  active: ChatConversation | null,
  lastMineId: string | undefined,
  m: ChatMessage,
  t: TFunction,
): Receipt | null {
  if (!active || m.id !== lastMineId) return null;
  const r = readState(active, m);
  return { read: r.readBy > 0, label: receiptLabel(r, active.type === 'DIRECT', t) };
}

/** The header of a page that is not the thread itself. */
export function pageTitle(view: string, active: ChatConversation | null, t: TFunction, language: string): string {
  return view === 'group'
    ? t('chat.newGroup', 'New group')
    : view === 'info'
      ? active
        ? conversationTitle(active, language)
        : ''
      : view === 'add'
        ? t('chat.addPeople', 'Add people')
        : t('chat.newMessage', 'New message');
}
