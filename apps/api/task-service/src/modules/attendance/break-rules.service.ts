import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  resolveBreakPlan,
  nextBreakRemindAt,
  parseBreakPlan,
  success,
  type BreakPlanItem,
  type BreakRuleLike,
} from '@hbcfield/shared';

/**
 * The rests a workspace expects, and this shift's plan of them.
 *
 * Two jobs, deliberately in one place because they are two views of one idea:
 * the CONFIGURATION an organization writes, and the concrete PLAN one person is
 * asked to follow today. Keeping the resolution beside the rules is what stops a
 * second interpretation of "which rests apply" appearing somewhere else.
 */
@Injectable()
export class BreakRulesService {
  private readonly logger = new Logger(BreakRulesService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── Configuration ───────────────────────────────────────────────────────

  /**
   * The rules that apply to a shift in a space.
   *
   * NARROWEST WINS: if the shift has rules of its own they replace the space's
   * entirely, rather than being added to them. Merging would make "the night
   * shift has one shorter break instead of two" impossible to express — you
   * could only ever add rests, never take one away.
   */
  async rulesFor(spaceId: string, shiftId?: string | null): Promise<BreakRuleLike[]> {
    if (shiftId) {
      const own = await this.prisma.breakRule.findMany({
        where: { shiftId, isActive: true },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      });
      if (own.length > 0) return own as unknown as BreakRuleLike[];
    }
    const spaceRules = await this.prisma.breakRule.findMany({
      where: { spaceId, shiftId: null, isActive: true },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
    return spaceRules as unknown as BreakRuleLike[];
  }

  async list(data: { organizationId: string; spaceId?: string; shiftId?: string }) {
    const rows = await this.prisma.breakRule.findMany({
      where: {
        organizationId: data.organizationId,
        ...(data.spaceId ? { spaceId: data.spaceId } : {}),
        ...(data.shiftId ? { shiftId: data.shiftId } : {}),
      },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
    return success(rows);
  }

  async create(data: BreakRuleInput & { organizationId: string }) {
    await this.assertScopeInOrg(data);
    const patch = this.validate(data);
    const created = await this.prisma.breakRule.create({
      data: {
        organizationId: data.organizationId,
        spaceId: data.spaceId ?? null,
        shiftId: data.shiftId ?? null,
        ...patch,
        name: patch.name ?? 'Rest',
      } as never,
    });
    this.logger.log(`Break rule created: ${created.id} (${created.name}) space=${data.spaceId ?? '-'}`);
    return success(created, 'Rest added');
  }

  async update(data: BreakRuleInput & { id: string; organizationId: string }) {
    const existing = await this.prisma.breakRule.findFirst({
      where: { id: data.id, organizationId: data.organizationId },
    });
    if (!existing) throw new NotFoundException('Rest not found');
    const patch = this.validate({ ...(existing as unknown as BreakRuleInput), ...data });
    const updated = await this.prisma.breakRule.update({ where: { id: existing.id }, data: patch as never });
    return success(updated, 'Rest updated');
  }

  async remove(data: { id: string; organizationId: string }) {
    const existing = await this.prisma.breakRule.findFirst({
      where: { id: data.id, organizationId: data.organizationId },
    });
    if (!existing) throw new NotFoundException('Rest not found');
    /*
      Deactivated, not deleted.

      Plans already frozen onto open shifts refer to this rule by id, and a
      member halfway through the day should not have their afternoon rearranged
      because somebody tidied the settings. Removing it stops it being planned
      tomorrow; today runs to its end.
    */
    await this.prisma.breakRule.update({ where: { id: existing.id }, data: { isActive: false } });
    return success({ id: existing.id }, 'Rest removed');
  }

  // ── This shift's plan ───────────────────────────────────────────────────

  /**
   * Resolve the rests for one clock-in, ready to be stamped onto the entry.
   *
   * Never throws: a shift that cannot be planned is a shift with no rests, which
   * is exactly today's behaviour. A rest engine is not a reason to refuse
   * somebody the ability to start work.
   */
  async planForClockIn(params: {
    spaceId: string;
    shiftId?: string | null;
    clockInAt: Date;
    expectedStartAt?: Date | null;
    expectedEndAt?: Date | null;
    timezone: string;
  }): Promise<{ breakPlan: BreakPlanItem[]; nextBreakRemindAt: Date | null }> {
    try {
      const rules = await this.rulesFor(params.spaceId, params.shiftId);
      if (rules.length === 0) return { breakPlan: [], nextBreakRemindAt: null };

      const breakPlan = resolveBreakPlan(rules, {
        clockInAt: params.clockInAt,
        expectedStartAt: params.expectedStartAt ?? null,
        expectedEndAt: params.expectedEndAt ?? null,
        timezone: params.timezone,
      });

      // Only rests that ask to be reminded arm the sweep; a rule with reminders
      // off is still planned and still counted, it simply never interrupts.
      const remindable = breakPlan.filter((i) => rules.find((r) => r.id === i.ruleId)?.remind !== false);
      return { breakPlan, nextBreakRemindAt: nextBreakRemindAt(remindable, params.clockInAt) };
    } catch (err) {
      this.logger.error(`Break plan resolution failed for space=${params.spaceId}: ${err}`);
      return { breakPlan: [], nextBreakRemindAt: null };
    }
  }

  /** The plan on an entry, safely. */
  planOf(entry: { breakPlan?: unknown }): BreakPlanItem[] {
    return parseBreakPlan(entry?.breakPlan);
  }

  // ── Guards ──────────────────────────────────────────────────────────────

  private async assertScopeInOrg(data: { organizationId: string; spaceId?: string | null; shiftId?: string | null }) {
    if (!data.spaceId && !data.shiftId) {
      throw new BadRequestException('A rest belongs to a workspace or to a shift');
    }
    // Both ends are checked against the caller's organization, so an id guessed
    // from another tenant is not found rather than silently accepted.
    if (data.spaceId) {
      const space = await this.prisma.companyLocation.findFirst({
        where: { id: data.spaceId, organizationId: data.organizationId },
        select: { id: true },
      });
      if (!space) throw new NotFoundException('Workspace not found');
    }
    if (data.shiftId) {
      const shift = await this.prisma.shift.findFirst({
        where: { id: data.shiftId, organizationId: data.organizationId },
        select: { id: true },
      });
      if (!shift) throw new NotFoundException('Shift not found');
    }
  }

  /**
   * Clamp everything a client can send.
   *
   * Every one of these ends up deciding when somebody stops working and how much
   * of their day is paid, so nothing arrives from a form unchecked — a rest of
   * -30 minutes or 9 999 minutes is not a validation nicety.
   */
  private validate(data: BreakRuleInput) {
    const trigger = data.trigger === 'AFTER_WORKED' ? 'AFTER_WORKED' : 'LOCAL_WINDOW';
    const hm = (v?: string | null) => (v && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : null);

    if (trigger === 'LOCAL_WINDOW' && !hm(data.earliestLocal)) {
      throw new BadRequestException('Give the time the rest becomes due, as HH:MM');
    }
    if (trigger === 'AFTER_WORKED' && (data.afterMinutes ?? 0) <= 0) {
      throw new BadRequestException('Say how far into the shift the rest falls due');
    }

    return {
      ...(data.name !== undefined ? { name: String(data.name).trim().slice(0, 60) || 'Rest' } : {}),
      trigger,
      afterMinutes: trigger === 'AFTER_WORKED' ? clamp(data.afterMinutes, 1, 1440) : null,
      earliestLocal: trigger === 'LOCAL_WINDOW' ? hm(data.earliestLocal) : null,
      latestLocal: trigger === 'LOCAL_WINDOW' ? hm(data.latestLocal) : null,
      durationMinutes: clamp(data.durationMinutes, 1, 480) ?? 30,
      isPaid: !!data.isPaid,
      isRequired: data.isRequired !== false,
      remind: data.remind !== false,
      snoozeMin: clamp(data.snoozeMin, 5, 120) ?? 15,
      maxSnoozes: data.maxSnoozes == null ? null : clamp(data.maxSnoozes, 0, 10),
      ...(data.isActive !== undefined ? { isActive: !!data.isActive } : {}),
      ...(data.position !== undefined ? { position: clamp(data.position, 0, 99) ?? 0 } : {}),
    };
  }
}

function clamp(v: number | null | undefined, min: number, max: number): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  return Math.min(max, Math.max(min, Math.round(v)));
}

export interface BreakRuleInput {
  spaceId?: string | null;
  shiftId?: string | null;
  name?: string;
  trigger?: string;
  afterMinutes?: number | null;
  earliestLocal?: string | null;
  latestLocal?: string | null;
  durationMinutes?: number;
  isPaid?: boolean;
  isRequired?: boolean;
  remind?: boolean;
  snoozeMin?: number;
  maxSnoozes?: number | null;
  isActive?: boolean;
  position?: number;
}
