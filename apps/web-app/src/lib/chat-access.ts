/**
 * Is there a conversation to open with this person?
 *
 * Chat is between two people. There is no conversation with yourself, and none
 * with nobody — so a Message button pointing at either is a button that does
 * nothing when pressed.
 *
 * That kept shipping. The task card offered a member a Message button aimed at
 * themselves; the employee panel did the same on your own card; before both,
 * the task card opened `mailto:` against a field it never had. Each was the
 * same defect — a control whose action silently evaluates to nothing — and each
 * was found by a person clicking it, because each screen decided the rule for
 * itself or forgot to.
 *
 * One definition, so a screen can ask instead of guess. The chat context
 * consumes it, `useContactActions` re-exports it, and screens call it before
 * rendering the button.
 */
export function canOpenConversationWith(
  targetUserId?: string | null,
  myUserId?: string | null,
): boolean {
  if (!targetUserId) return false
  return targetUserId !== myUserId
}
