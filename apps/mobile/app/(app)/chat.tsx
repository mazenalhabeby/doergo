import { Redirect, useLocalSearchParams } from 'expo-router';

/**
 * Messages moved INTO the tab group and this is its old door.
 *
 * ⚠️ Do not delete. `/(app)/chat` is what `notification-route.ts` builds for a
 * `chat` push, what the destination table pointed at, and what is sitting in
 * every notification already delivered to a phone. A route that moves without
 * leaving one behind turns every one of those taps into a blank screen, and
 * the ones already delivered cannot be rewritten.
 *
 * `conversationId` is carried through, because a chat notification names the
 * thread and arriving at the list instead is the same failure more quietly.
 */
export default function ChatRedirect() {
  const { conversationId } = useLocalSearchParams<{ conversationId?: string }>();
  return (
    <Redirect
      href={{
        pathname: '/(app)/(tabs)/chat',
        ...(conversationId ? { params: { conversationId } } : {}),
      }}
    />
  );
}
