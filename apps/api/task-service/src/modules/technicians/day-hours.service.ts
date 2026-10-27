import { ApprovalRulesService } from '../approvals/rules/approval-rules.service';
import { REQUEST_RULE_SELECT, requestRuleFacts } from '../approvals/rules/request-rule-facts';
import {
  assertMemberInScope,
  notEndedWhere,
  parseRequestInput,
  personName,
  personPasses,
  toISODateString,
} from '@hbcfield/shared';
import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ModuleRef } from '@nestjs/core';
import { PrismaService, SERVICE_NAMES, success } from '@hbcfield/shared';
import { emitEvent, timeOffDecidedEvent } from '@hbcfield/shared/microservices';
import { assertNotSelfDecision } from '../attendance/core/self-decision';
import { DayHoursReshapeService } from '../attendance/shifts/day-hours-reshape.service';
import { REQUEST_REFUSALS, SPACE_BRIEF, requestFacts } from './technicians-helpers';
import { requestClashes } from './member-requests';
import { ShiftResolverService } from '../attendance/core/shift-resolver.service';
import { readDayHours } from './day-hours-read';
import { waitingReply } from '../approvals/rules/approval-rules-helpers';

export interface SetDayHoursInput {
  editorId: string;
  organizationId: string;
  technicianId: string;
  /** Workspaces the editor holds the rota permission in; undefined = org-wide. Server-resolved. */
  scopeSpaceIds?: string[];
  /** The local day, YYYY-MM-DD. */
  date: string;
  /** The workspace; required for a workspace-scoped editor, null = every workspace. */
  spaceId?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  reason?: string | null;
}

/**
 * The office changes the hours of ONE day for a member (docs/plans/time-counting-model.md, phase 2).
 *
 * ⚠️ No new model: it is the member's own "changed hours" request, written already APPROVED by the
 * person with the rota permission. A clock-in that day reads it through `applyApprovedRequests` like
 * any approved request, so the clock counts the new window with no decision afterwards; a day already
 * clocked is re-shaped through the same rule (`DayHoursReshapeService`). Setting the day again
 * replaces the earlier hours — one answer per day, never two.
 */
@Injectable()
export class DayHoursService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reshape: DayHoursReshapeService,
    @Inject(SERVICE_NAMES.NOTIFICATION) private readonly notificationClient: ClientProxy,
    // Office rules: hours the office sets for a day follow the same rules as hours a member asks for.
    private readonly rules: ApprovalRulesService,
    // The rota's plan for the form's read — the resolver lives in attendance's core module.
    private readonly moduleRef?: ModuleRef,
  ) {}

  /** What the form shows before anything changes: the plan, hours already set, clocked in, leave. */
  async getDayHours(data: {
    organizationId: string;
    technicianId: string;
    scopeSpaceIds?: string[];
    date: string;
    spaceId: string;
  }) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date) || !data.spaceId) {
      throw new BadRequestException({ code: 'REQUEST_DATES_INVALID', message: 'Choose a day and a workspace.' });
    }
    await this.assertMayEdit(data, data.spaceId);
    const resolver = this.moduleRef!.get(ShiftResolverService, { strict: false });
    return success(await readDayHours(this.prisma, resolver, data));
  }

  async setDayHours(data: SetDayHoursInput) {
    const { organizationId, technicianId, editorId } = data;
    // An exact day: the shared parser reads the first ten characters of a timestamp, which would let a
    // day with anything after it through as that day.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data.date ?? ''))) {
      throw new BadRequestException({ code: 'REQUEST_DATES_INVALID', message: REQUEST_REFUSALS.REQUEST_DATES_INVALID });
    }
    // ONE reader of a request body: the same times, the same refusals as the member's own request.
    const parsed = parseRequestInput({
      kind: 'HOURS',
      startDate: data.date,
      endDate: data.date,
      startTime: data.startTime ?? undefined,
      endTime: data.endTime ?? undefined,
      spaceId: data.spaceId ?? undefined,
      reason: data.reason ?? undefined,
    });
    if (!parsed.ok) throw new BadRequestException({ code: parsed.code, message: REQUEST_REFUSALS[parsed.code] });
    const value = parsed.value;
    const spaceId = value.spaceId ?? null;

    await this.assertMayEdit(data, spaceId);
    await assertNotSelfDecision(this.prisma, {
      deciderId: editorId,
      subjectId: technicianId,
      organizationId,
      message: 'You cannot set your own hours. Ask a manager or an administrator.',
    });

    const day = new Date(value.startDate);
    const clashes = await requestClashes(this.prisma, technicianId, 'HOURS', day, day);
    const onLeave = clashes.find((c) => c.kind === 'LEAVE');
    if (onLeave) {
      throw new BadRequestException({
        code: 'REQUEST_OVERLAPS_LEAVE',
        params: {
          from: toISODateString(onLeave.startDate),
          to: toISODateString(onLeave.endDate),
          status: onLeave.status,
        },
        message: 'That day falls in leave already asked for or approved.',
      });
    }

    const previous = await this.prisma.timeOff.findFirst({
      where: {
        technicianId,
        kind: 'HOURS',
        status: { in: ['PENDING', 'APPROVED'] },
        startDate: { lte: day },
        endDate: { gte: day },
        spaceId,
      },
      select: { id: true, startDate: true, endDate: true, status: true },
    });
    // A changed-hours request over several days is one answer for all of them: changing one day of it is its own edit.
    if (previous && (previous.startDate.getTime() !== day.getTime() || previous.endDate.getTime() !== day.getTime())) {
      throw new BadRequestException({
        code: 'TIMEOFF_OVERLAP',
        params: {
          from: toISODateString(previous.startDate),
          to: toISODateString(previous.endDate),
          status: previous.status,
        },
        message: 'Changed hours already cover this day as part of a longer request.',
      });
    }

    // Saved waiting; the office's own entry is the first approval — an office rule on requests may ask more people.
    const fields = {
      startTime: value.startTime ?? null,
      endTime: value.endTime ?? null,
      reason: value.reason ?? null,
      status: 'PENDING' as const,
      approvedById: null,
      approvedAt: null,
    };
    // With the member's workspaces, as the one request reader takes it (request-rule-facts.ts).
    const include = { technician: REQUEST_RULE_SELECT.technician };
    const pending = previous
      ? await this.prisma.timeOff.update({ where: { id: previous.id }, data: fields, include })
      : await this.prisma.timeOff.create({
          data: { technicianId, kind: 'HOURS', startDate: day, endDate: day, spaceId, ...fields },
          include,
        });
    // Set again: approvals given for the EARLIER hours are void — the new hours start their approvals over.
    if (previous) await this.rules.clear(organizationId, 'request', pending.id);
    const decided = await this.rules.decide(
      {
        organizationId,
        kind: 'request',
        itemId: pending.id,
        // The ONE request reader — with no workspace named, the member's own workspaces (as Approvals reads it).
        facts: requestRuleFacts(pending, false, 1),
        deciderId: editorId,
        subjectId: technicianId,
      },
      () =>
        this.applyApproved({ id: pending.id, organizationId, technicianId, editorId, spaceId, date: value.startDate }),
    );
    if (decided.waiting) return waitingReply(pending, decided.waiting, 'Hours saved');
    const { saved, entriesChanged } = decided.done;
    return success({ ...saved, entriesChanged }, previous ? 'Hours for the day changed' : 'Hours for the day set');
  }

  /** Every approval in: the hours count, the day already clocked is re-shaped, and the member is told. */
  private async applyApproved(a: {
    id: string;
    organizationId: string;
    technicianId: string;
    editorId: string;
    spaceId: string | null;
    date: string;
  }) {
    const include = { space: { select: SPACE_BRIEF }, approvedBy: { select: { firstName: true, lastName: true } } };
    const saved = await this.prisma.timeOff.update({
      where: { id: a.id },
      data: { status: 'APPROVED', approvedById: a.editorId, approvedAt: new Date() },
      include,
    });
    const entriesChanged = await this.reshape.reshapeDay({
      organizationId: a.organizationId,
      userId: a.technicianId,
      date: a.date,
      spaceId: a.spaceId,
      request: {
        id: saved.id,
        kind: 'HOURS',
        spaceId: a.spaceId,
        startTime: saved.startTime,
        endTime: saved.endTime,
        minutes: null,
        startDate: saved.startDate,
        endDate: saved.endDate,
      },
      actorId: a.editorId,
      reason: saved.reason,
    });
    // Told, not asked: the member's day changed, and they hear it from the person who changed it.
    emitEvent(this.notificationClient, timeOffDecidedEvent, {
      timeOffId: saved.id,
      organizationId: a.organizationId,
      memberId: a.technicianId,
      ...requestFacts(saved),
      approved: true,
      startDate: a.date,
      endDate: a.date,
      setBy: saved.approvedBy ? personName(saved.approvedBy) : null,
    });
    return { saved, entriesChanged };
  }

  /**
   * The person is in this organization and in the editor's reach, and works in the workspace — asked
   * the same way by the form's read and by the write, so the form never offers what saving refuses.
   */
  private async assertMayEdit(
    data: { organizationId: string; technicianId: string; scopeSpaceIds?: string[] },
    spaceId: string | null,
  ): Promise<void> {
    const { organizationId, technicianId } = data;
    const member = await personPasses(this.prisma, technicianId, { organizationId });
    if (!member) throw new NotFoundException('Employee not found in organization');
    await assertMemberInScope(this.prisma, { userId: technicianId, organizationId, scopeSpaceIds: data.scopeSpaceIds });
    // A leader of one workspace sets hours THERE — never "everywhere", which would reach workspaces they do not lead.
    if (data.scopeSpaceIds !== undefined && (!spaceId || !data.scopeSpaceIds.includes(spaceId))) {
      throw new ForbiddenException({ code: 'DAY_HOURS_SPACE_NOT_YOURS', message: 'Choose a workspace you manage.' });
    }
    if (spaceId) {
      const assigned = await this.prisma.spaceAssignment.findFirst({
        where: { userId: technicianId, organizationId, spaceId, ...notEndedWhere() },
        select: { id: true },
      });
      if (!assigned) {
        throw new BadRequestException({
          code: 'REQUEST_SPACE_NOT_YOURS',
          message: 'This person does not work in that workspace.',
        });
      }
    }
  }
}
