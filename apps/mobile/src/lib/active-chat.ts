/**
 * Tracks the conversation the user is currently viewing, so the global chat
 * notifier can suppress a toast for a message you're already reading. Module-level
 * (not React state) because it's read inside a socket callback, not during render.
 */
export const activeChat = { conversationId: null as string | null };
