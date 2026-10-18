import { combinedServices } from '../../../common/testing/combined-services';
import { ChatService } from '../chat.service';
import { ChatMessagesService } from '../chat-messages.service';

/** The public face of a class (an intersection of classes with private members is `never`). */
type Public<T> = { [K in keyof T]: T[K] };

/** Every service split out of ChatService, as ONE object — the tests were written against the single class. */
export type ChatServiceParts = Public<ChatService> & Public<ChatMessagesService>;

/** The same, from a Nest test module that registered them all. */
export function chatPartsOf(mod: { get<T>(cls: new (...a: never[]) => T): T }): ChatServiceParts {
  // Only the services this test module registered — a test that provides one of them still works.
  const parts = [ChatService, ChatMessagesService].flatMap((C) => {
    try { return [mod.get(C as unknown as new (...a: never[]) => object)]; } catch { return []; }
  });
  return combinedServices<ChatServiceParts>(...parts);
}
