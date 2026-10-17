import type { ClientProxy } from '@nestjs/microservices';
import type { Observable } from 'rxjs';

/**
 * One message between the gateway and a service, typed at both ends.
 *
 * The wire is unchanged: a contract IS the `{ cmd }` pattern Nest matches on,
 * and the request/reply types exist only for the compiler. Before this, both
 * sides wrote the pattern as a string literal and typed the payload `any`, so a
 * field renamed on one side was silently `undefined` on the other.
 *
 *   // packages/shared/src/microservices/contracts/<module>.ts
 *   export const createInvitation = rpc<CreateInvitationInput, CreateInvitationReply>('create_invitation');
 *
 *   // service:  @MessagePattern(pattern(createInvitation)) create(@Payload() data: RpcRequest<typeof createInvitation>)
 *   // gateway:  await firstValueFrom(sendRpc(this.authClient, createInvitation, { … }))
 *   //           or, on a BaseGatewayService: await this.call(createInvitation, { … })
 */
export interface RpcContract<Req, Res> {
  readonly cmd: string;
  /** Phantom: never set, never sent — it only carries the two types. */
  readonly __types?: { req: Req; res: Res };
}

export function rpc<Req, Res = unknown>(cmd: string): RpcContract<Req, Res> {
  return { cmd };
}

export type RpcRequest<C> = C extends RpcContract<infer Req, unknown> ? Req : never;
export type RpcReply<C> = C extends RpcContract<unknown, infer Res> ? Res : never;

/** The pattern object for `@MessagePattern` — exactly what was written by hand before. */
export function pattern(contract: RpcContract<unknown, unknown>): { cmd: string } {
  return { cmd: contract.cmd };
}

/** `client.send` with the contract's types; the payload is checked against the request type. */
export function sendRpc<Req, Res>(client: ClientProxy, contract: RpcContract<Req, Res>, data: Req): Observable<Res> {
  return client.send<Res, Req>({ cmd: contract.cmd }, data);
}
