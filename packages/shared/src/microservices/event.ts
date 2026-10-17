import type { ClientProxy } from '@nestjs/microservices';
import type { Observable } from 'rxjs';

/**
 * One fire-and-forget event (mostly to notification-service), typed at both ends.
 *
 * The wire is unchanged: a contract IS the event name Nest matches on; the
 * payload type exists only for the compiler. Before this, the emitter wrote the
 * name as a string and the handler typed the payload by hand (or `any`), so a
 * field renamed on one side was silently `undefined` on the other.
 *
 *   // packages/shared/src/microservices/contracts/events-*.ts
 *   export const userRemovedEvent = event<{ userId: string; organizationId: string }>('user_removed');
 *
 *   // handler: @EventPattern(eventPattern(userRemovedEvent)) handle(@Payload() data: EventPayload<typeof userRemovedEvent>)
 *   // emitter: emitEvent(this.notificationClient, userRemovedEvent, { userId, organizationId })
 */
export interface EventContract<P> {
  readonly name: string;
  /** Phantom: never set, never sent — it only carries the payload type. */
  readonly __payload?: P;
}

export function event<P>(name: string): EventContract<P> {
  return { name };
}

export type EventPayload<C> = C extends EventContract<infer P> ? P : never;

/** The pattern for `@EventPattern` — exactly the string that was written by hand before. */
export function eventPattern(contract: EventContract<unknown>): string {
  return contract.name;
}

/** `client.emit` with the contract's payload type. Returns what `emit` returns. */
export function emitEvent<P>(client: ClientProxy, contract: EventContract<P>, payload: P): Observable<unknown> {
  return client.emit<unknown, P>(contract.name, payload);
}
