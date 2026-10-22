import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout, type Observable } from 'rxjs';
import { SERVICE_NAMES } from '@hbcfield/shared';
import { emitEvent, sendRpc, type EventContract, type RpcContract } from '@hbcfield/shared/microservices';

/**
 * How long a call may take before the gateway gives up on it. A guard against a call that never
 * answers (a service restarting mid-request held the HTTP request open for good) — not a budget:
 * long enough for an export or a document read. A caller that knows better passes its own.
 */
export const RPC_TIMEOUT_MS = 120_000;

/** One microservice, as a controller talks to it. */
export class ServiceLine {
  constructor(private readonly client: ClientProxy) {}

  /**
   * Ask and wait for the answer — ONCE, never retried (a timeout means "no answer arrived", not
   * "nothing happened", so a retried write could happen twice). A refusal from the service is thrown
   * as it came, so the global filter maps it exactly as before (4xx with its code; 5xx as a generic
   * line); only a call that never answers becomes 408.
   */
  async ask<Req, Res>(contract: RpcContract<Req, Res>, data: Req, opts: { timeoutMs?: number } = {}): Promise<Res> {
    return this.wait(sendRpc(this.client, contract, data), opts.timeoutMs);
  }

  /** `ask` for a message named at run time (a command picked from a table). Prefer `ask`. */
  async askCmd<T = unknown>(cmd: string, data: unknown, opts: { timeoutMs?: number } = {}): Promise<T> {
    return this.wait(this.client.send<T>({ cmd }, data), opts.timeoutMs);
  }

  /** Tell, and do not wait: an event (fire-and-forget, as `emitEvent`). */
  tell<P>(contract: EventContract<P>, payload: P): Observable<unknown> {
    return emitEvent(this.client, contract, payload);
  }

  private async wait<T>(call: Observable<T>, timeoutMs = RPC_TIMEOUT_MS): Promise<T> {
    try {
      return await firstValueFrom(call.pipe(timeout(timeoutMs)));
    } catch (err) {
      if ((err as Error)?.name === 'TimeoutError')
        throw new HttpException('Service timeout', HttpStatus.REQUEST_TIMEOUT);
      throw err;
    }
  }
}

/**
 * THE way a gateway controller calls a microservice (code-structure-fix 4.5): `this.services.task.ask(
 * contract, data)`. No controller injects a ClientProxy (`service-calls-guard.spec.ts`).
 */
@Injectable()
export class ServiceCalls {
  readonly auth: ServiceLine;
  readonly task: ServiceLine;
  readonly tracking: ServiceLine;
  readonly notification: ServiceLine;

  constructor(
    @Inject(SERVICE_NAMES.AUTH) auth: ClientProxy,
    @Inject(SERVICE_NAMES.TASK) task: ClientProxy,
    @Inject(SERVICE_NAMES.TRACKING) tracking: ClientProxy,
    @Inject(SERVICE_NAMES.NOTIFICATION) notification: ClientProxy,
  ) {
    this.auth = new ServiceLine(auth);
    this.task = new ServiceLine(task);
    this.tracking = new ServiceLine(tracking);
    this.notification = new ServiceLine(notification);
  }
}
