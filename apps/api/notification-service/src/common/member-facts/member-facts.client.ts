import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import { SERVICE_NAMES } from '@hbcfield/shared';
import { sendRpc, userMarkInactive, usersMarkActive, userSetLocale } from '@hbcfield/shared/microservices';

/**
 * What this service learns about a member — who has a socket open, which language their app speaks —
 * told to auth-service, which owns `User` (docs/data-ownership.md, group F).
 *
 * Best effort with a short timeout on purpose: presence and a learned language are conveniences.
 * A delivery or a socket must never wait on, or fail because of, auth-service restarting.
 */
@Injectable()
export class MemberFactsClient {
  private readonly logger = new Logger(MemberFactsClient.name);
  constructor(@Inject(SERVICE_NAMES.AUTH) private readonly auth: ClientProxy) {}

  /** Last active = now for every one of them; with `withPresence`, each one's chosen presence. */
  async markActive(userIds: string[], withPresence = false): Promise<Record<string, string | null> | null> {
    if (!userIds.length) return {};
    try {
      const r = await firstValueFrom(
        sendRpc(this.auth, usersMarkActive, { userIds, withPresence }).pipe(timeout(5_000)),
      );
      return r?.presence ?? null;
    } catch (e) {
      this.logger.warn(`users_mark_active failed (${userIds.length}): ${(e as Error)?.message ?? e}`);
      return null;
    }
  }

  async markInactive(userId: string): Promise<void> {
    await this.ask('user_mark_inactive', () => sendRpc(this.auth, userMarkInactive, { userId }));
  }

  async setLocale(userId: string, locale: string): Promise<void> {
    await this.ask('user_set_locale', () => sendRpc(this.auth, userSetLocale, { userId, locale }));
  }

  private async ask(name: string, call: () => import('rxjs').Observable<unknown>) {
    try {
      await firstValueFrom(call().pipe(timeout(5_000)));
    } catch (e) {
      this.logger.warn(`${name} failed: ${(e as Error)?.message ?? e}`);
    }
  }
}
