import type { TFunction } from 'i18next';
import { conversationTitle, readState, type ChatConversation, type ChatMessage } from '@hbcfield/shared/client';
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
  if (r.readBy === 0) return { read: false, label: t('chat.sent', 'Sent') };
  if (active.type === 'DIRECT') return { read: true, label: t('chat.read', 'Read') };
  return {
    read: true,
    label:
      r.readBy >= r.of
        ? t('chat.seenByAll', 'Seen by everyone')
        : t('chat.seenBy', { count: r.readBy, defaultValue: 'Seen by {{count}}' }),
  };
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
