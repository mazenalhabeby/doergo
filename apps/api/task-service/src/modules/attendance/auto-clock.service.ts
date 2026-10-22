import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import {
  AUTO_REST_FLAG,
  SERVICE_NAMES,
  activeAssignmentWhere,
  autoRestPlan,
  success,
  type MemberAutoClockSettings,
  activityLogged,
  personAutoClockFacts,
} from '@hbcfield/shared';
import { sendRpc, userSetAutoClockConsent } from '@hbcfield/shared/microservices';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@hbcfield/shared';
import { AUTO_UNDO_EVENT, EntryRef, MEMBER_AUTO_CLOCK_SELECT, memberAutoClock } from './auto-clock-helpers';

export { AUTO_UNDO_EVENT } from './auto-clock-helpers';

@Injectable()
export class AutoClockService {
  private readonly logger = new Logger(AutoClockService.name);
  constructor(
    private readonly prisma: PrismaService,
    // auth-service owns User: the consent column is written there (docs/data-ownership.md, group F).
    @Optional() @Inject(SERVICE_NAMES.AUTH) private readonly auth?: ClientProxy,
  ) {}

  // ── Is this member automatic? ───────────────────────────────────────────

  /** The settings in force for this member at this workspace at `at`, or null when the automatic clock is not on for them. One query. */
  async settingsFor(userId: string, spaceId: string, at: Date): Promise<MemberAutoClockSettings | null> {
    const row = await this.prisma.spaceAssignment.findFirst({
      where: { ...activeAssignmentWhere(userId, at), spaceId, autoClock: true },
      select: {
        ...MEMBER_AUTO_CLOCK_SELECT,
        space: { select: { ...MEMBER_AUTO_CLOCK_SELECT.space.select, isRemote: true } },
      },
    });
    if (!row || row.space.isRemote) return null;
    return memberAutoClock(row);
  }

  /**
   * The same answer for a sweep's whole batch — ONE query whatever its size.
   * Keyed by entry id; an entry absent from the map is not automatic.
   */
  async settingsForEntries(
    entries: readonly EntryRef[],
    at: Date = new Date(),
  ): Promise<Map<string, MemberAutoClockSettings>> {
    const out = new Map<string, MemberAutoClockSettings>();
    if (!entries.length) return out;
    const userIds = [...new Set(entries.map((e) => e.userId))];
    const spaceIds = [...new Set(entries.map((e) => e.locationId))];
    const rows = await this.prisma.spaceAssignment.findMany({
      where: {
        userId: { in: userIds },
        spaceId: { in: spaceIds },
        autoClock: true,
        // Assigned at the shift's clock-in: a member removed mid-shift still had it.
        effectiveFrom: { lte: at },
        space: { autoClock: { not: Prisma.DbNull }, isRemote: false },
      },
      select: { ...MEMBER_AUTO_CLOCK_SELECT, userId: true, spaceId: true, effectiveTo: true, effectiveFrom: true },
    });
    for (const e of entries) {
      const row = rows.find(
        (r) =>
          r.userId === e.userId &&
          r.spaceId === e.locationId &&
          r.effectiveFrom <= e.clockInAt &&
          (!r.effectiveTo || r.effectiveTo >= e.clockInAt),
      );
      if (!row) continue;
      const s = memberAutoClock(row);
      if (s) out.set(e.id, s);
    }
    return out;
  }

  // ── The rest at the close ───────────────────────────────────────────────

  /**
   * The automatic rest to insert as a shift closes, or null.
   *
   * Only when cheap to rule out first (no rest of any kind recorded, not
   * skipped, not already applied, a planned shift longer than six hours) — so
   * the one query below runs for a small minority of closes. The rest is the
   * shared `autoRestPlan` (centred in the PLANNED shift), clamped inside the
   * entry as it actually ran; nothing is inserted when it no longer fits.
   */
  async autoRestAtClose(
    entry: EntryRef & {
      expectedClockInAt?: Date | null;
      expectedClockOutAt?: Date | null;
      autoRestSkippedAt?: Date | null;
      flagReasons?: string[] | null;
      breaks?: unknown[];
    },
    closeAt: Date,
  ): Promise<{ startedAt: Date; endedAt: Date; minutes: number } | null> {
    // Rests unknown (a caller that did not read them) is never "none taken".
    if (!entry.breaks || entry.breaks.length > 0 || entry.autoRestSkippedAt) return null;
    if ((entry.flagReasons ?? []).includes(AUTO_REST_FLAG)) return null;
    if (!entry.expectedClockInAt || !entry.expectedClockOutAt || !entry.locationId) return null;
    if ((entry.expectedClockOutAt.getTime() - entry.expectedClockInAt.getTime()) / 60_000 <= 360) return null;
    const settings = await this.settingsFor(entry.userId, entry.locationId, entry.clockInAt);
    if (!settings) return null;
    const planned = autoRestPlan({
      settings,
      shiftStart: entry.expectedClockInAt,
      shiftEnd: entry.expectedClockOutAt,
      restTaken: false,
    });
    if (!planned) return null;
    const startedAt = new Date(Math.max(planned.startAt.getTime(), entry.clockInAt.getTime()));
    const endedAt = new Date(Math.min(planned.endAt.getTime(), closeAt.getTime()));
    const minutes = Math.round((endedAt.getTime() - startedAt.getTime()) / 60_000);
    return minutes > 0 ? { startedAt, endedAt, minutes } : null;
  }

  // ── Consent ─────────────────────────────────────────────────────────────

  /** The member's own consent (ArbVG §96). Giving it twice keeps the first date; withdrawing clears it and the phone disarms. */
  async setConsent(data: { userId: string; organizationId: string; consent: boolean }) {
    const user = await personAutoClockFacts(this.prisma, data.userId, data.organizationId);
    if (!user) throw new NotFoundException('Member not found');
    if (data.consent && user.isExternal) {
      // An external member holds no clock — there is nothing to consent to.
      throw new BadRequestException({
        message: 'External members do not use the clock',
        code: 'AUTO_CLOCK_NOT_FOR_EXTERNAL',
      });
    }
    const consentAt = data.consent ? (user.autoClockConsentAt ?? new Date()) : null;
    if ((consentAt?.getTime() ?? null) !== (user.autoClockConsentAt?.getTime() ?? null)) {
      await this.storeConsent(user.id, consentAt);
    }
    return success({ consentAt: consentAt ? consentAt.toISOString() : null });
  }

  /** Asked of auth-service and awaited: the member must hear whether their answer was kept. */
  private async storeConsent(userId: string, consentAt: Date | null) {
    const refused = new ServiceUnavailableException('Your answer could not be saved right now. Try again.');
    if (!this.auth) throw refused;
    try {
      const r = await firstValueFrom(
        sendRpc(this.auth, userSetAutoClockConsent, { userId, consentAt: consentAt?.toISOString() ?? null }).pipe(
          timeout(10_000),
        ),
      );
      if (!r?.success) throw new Error('refused');
    } catch (e) {
      this.logger.error(`user_set_auto_clock_consent failed for ${userId}: ${(e as Error)?.message ?? e}`);
      throw refused;
    }
  }

  // ── Undo a drive-past ───────────────────────────────────────────────────

  /** Was this id an automatic clock-in its owner undid? A resend of it must not make the shift again. */
  async wasUndone(entryId: string, userId: string): Promise<boolean> {
    const row = await activityLogged(this.prisma, { resourceId: entryId, eventType: AUTO_UNDO_EVENT, userId });
    return !!row;
  }
}
