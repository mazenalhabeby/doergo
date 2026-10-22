import { Redirect, useLocalSearchParams } from 'expo-router';
import { ChatScreen } from '../../../src/features/chat/chat-screen';

/**
 * One conversation, or "New message". The list of conversations is Team →
 * Messages, so `/chat` with nothing to open goes there (an old link, a stale push).
 */
export default function ChatRoute() {
  const {
    conversationId,
    userId,
    new: isNew,
  } = useLocalSearchParams<{ conversationId?: string; userId?: string; new?: string }>();
  if (!conversationId && !userId && !isNew)
    return <Redirect href={{ pathname: '/(app)/(tabs)/team', params: { half: 'messages' } } as never} />;
  return <ChatScreen key={conversationId ?? userId ?? 'new'} />;
}
