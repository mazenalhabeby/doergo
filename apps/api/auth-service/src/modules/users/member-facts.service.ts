import { Injectable } from '@nestjs/common';
import { normalizeLocale } from '@hbcfield/shared';
import { PrismaService } from '../../common/prisma/prisma.service';

/** Most ids one heartbeat may name — a socket server holds one entry per connected member. */
const MAX_ACTIVE_IDS = 5_000;

/**
 * One-column facts other services learn about a member and auth-service stores — auth owns `User`
 * (docs/data-ownership.md, group F). Every value is checked HERE before it is written: a caller can
 * set exactly these columns and nothing else, and `updateMany` keeps a just-deleted member from
 * throwing out of a delivery path.
 */
@Injectable()
export class MemberFactsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Open sockets now: last active = now. `withPresence` answers each member's chosen presence. */
  async markActive(input: { userIds: string[]; withPresence?: boolean }) {
    const ids = [...new Set((input.userIds ?? []).filter((x) => typeof x === 'string' && x))].slice(0, MAX_ACTIVE_IDS);
    if (!ids.length) return { success: true, presence: {} };
    await this.prisma.user.updateMany({ where: { id: { in: ids } }, data: { lastActiveAt: new Date() } });
    if (!input.withPresence) return { success: true };
    const rows = await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, presence: true } });
    return { success: true, presence: Object.fromEntries(rows.map((r) => [r.id, r.presence ?? null])) };
  }

  /** The last socket closed and they are not on the clock: no last-active, so they read as offline. */
  async markInactive(input: { userId: string }) {
    if (!input.userId) return { success: false };
    await this.prisma.user.updateMany({ where: { id: input.userId }, data: { lastActiveAt: null } });
    return { success: true };
  }

  /** The language the member's app reports — only one there is a catalogue for. */
  async setLocale(input: { userId: string; locale: string }) {
    const locale = normalizeLocale(input.locale);
    if (!input.userId || !locale) return { success: false };
    await this.prisma.user.updateMany({ where: { id: input.userId }, data: { locale } });
    return { success: true };
  }

  /** Agreed to the automatic clock (the first date is kept by the caller), or withdrawn (null). */
  async setAutoClockConsent(input: { userId: string; consentAt: string | null }) {
    const at = input.consentAt === null ? null : new Date(input.consentAt);
    if (!input.userId || (at !== null && Number.isNaN(at.getTime()))) return { success: false };
    await this.prisma.user.updateMany({ where: { id: input.userId }, data: { autoClockConsentAt: at } });
    return { success: true };
  }
}
