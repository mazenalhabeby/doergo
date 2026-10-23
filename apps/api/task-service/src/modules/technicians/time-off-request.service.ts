import {
  personName,
  notEndedWhere,
  assertFoundInOrg,
  isAbsence,
  parseRequestInput,
  type RequestInput,
  toISODateString,
} from '@hbcfield/shared';
import { Inject, Injectable, BadRequestException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService, SERVICE_NAMES, success } from '@hbcfield/shared';
import { askAboutOwnRequest } from '../approvals/own-request-route';
import { findPrior } from '../../common/create-once.util';
import { RequestTimeOffDto } from './dto';
import { SPACE_BRIEF, REQUEST_REFUSALS, requestFacts } from './technicians-helpers';
import { NotificationRoutingService } from '../notification-routing/notification-routing.service';
import { CalendarRulesService } from '../calendar/calendar-rules.service';
import { CoverService } from './cover.service';
import { requestClashes, requestSpaces, workingDaysOf } from './member-requests';
import { TimeOffDecisionService } from './time-off-decision.service';
import { emitEvent, timeOffRequestedEvent } from '@hbcfield/shared/microservices';

/** A member asking for time off (or another request): what they may ask, and sending it. */
@Injectable()
export class TimeOffRequestService {
  constructor(
    private readonly prisma: PrismaService,
    /*
      Who is told ABOUT this member. Leave asks the organization for time, so the
      question "who hears about it" is the same question attendance already
      answers, and it is answered in one place: explicit watchers chosen on the
      member's Access page, UNION the routing configured on the spaces they work
      in (their per-space override first, the space's own notify roles second).
      Nothing configured anywhere → nobody is told, deliberately.
    */
    private readonly notificationRouting: NotificationRoutingService,
    // A member asking for days deserves the same cover answer the approver will see.
    private readonly cover: CoverService,
    // What a range of leave COSTS — weekends, rota rest days and holidays left out (shared calendar/days.ts).
    private readonly calendarRules: CalendarRulesService,
    @Inject(SERVICE_NAMES.NOTIFICATION) private readonly notificationClient: ClientProxy,
    // Used for one thing — a sole administrator's own request is approved at once.
    private readonly decisions: TimeOffDecisionService,
  ) {}

  /** What the CALLER may ask for, and where they may ask for a remote day. Only their own. */
  async requestOptions(dto: { userId: string; organizationId: string }) {
    const { spaces, kinds } = await requestSpaces(this.prisma, dto.organizationId, dto.userId);
    return success({
      kinds,
      remoteSpaces: spaces.filter((s) => s.kinds.includes('REMOTE')).map((s) => ({ id: s.id, name: s.name })),
    });
  }

  /**
   * Validate a request against the member's workspaces: the workspace is theirs, the kind is
   * offered there, and a remote day is something they may do there. Coded refusals.
   */
  private async assertRequestAllowed(organizationId: string, technicianId: string, value: RequestInput): Promise<void> {
    const ctx = await requestSpaces(this.prisma, organizationId, technicianId);
    if (value.spaceId) {
      const mine = ctx.spaces.find((s) => s.id === value.spaceId);
      if (!mine) {
        // Another organization's workspace (or none) answers the same 404 as a missing one.
        const space = await this.prisma.companyLocation.findFirst({
          where: { id: value.spaceId },
          select: { organizationId: true },
        });
        assertFoundInOrg(space, organizationId, 'Workspace');
        throw new BadRequestException({
          code: 'REQUEST_SPACE_NOT_YOURS',
          message: 'You are not assigned to that workspace.',
        });
      }
      if (value.kind === 'REMOTE' && !mine.mayWorkRemotely) {
        throw new BadRequestException({
          code: 'REQUEST_REMOTE_NOT_ALLOWED',
          message: `You are not set up to work away from ${mine.name}.`,
        });
      }
      if (!mine.kinds.includes(value.kind)) {
        throw new BadRequestException({
          code: 'REQUEST_KIND_NOT_OFFERED',
          message: `${mine.name} does not take this kind of request.`,
        });
      }
    } else if (!ctx.kinds.includes(value.kind)) {
      throw new BadRequestException({
        code: 'REQUEST_KIND_NOT_OFFERED',
        message: 'Your workspaces do not take this kind of request.',
      });
    }
  }

  /**
   * Request something — leave, a remote day, changed hours, overtime agreed in advance, or
   * anything else (shared requests/request-kinds.ts). One record, one approval flow.
   */
  async requestTimeOff(dto: RequestTimeOffDto) {
    const { technicianId, organizationId } = dto;

    // The same request sent again from the phone's queue: answered before the
    // overlap rule, which would otherwise refuse it as overlapping itself.
    const prior = await findPrior({
      id: dto.id,
      find: (id) =>
        this.prisma.timeOff.findUnique({
          where: { id },
          include: {
            technician: { select: { id: true, firstName: true, lastName: true } },
            space: { select: SPACE_BRIEF },
          },
        }),
      isSame: (row) => row.technicianId === technicianId,
    });
    if (prior) return success(prior, 'Time-off request already recorded');

    // ONE reader of a request body, shared with the phone and the web.
    const parsed = parseRequestInput(dto);
    if (!parsed.ok) throw new BadRequestException({ code: parsed.code, message: REQUEST_REFUSALS[parsed.code] });
    const value = parsed.value;
    const leave = isAbsence(value.kind);
    // Only VACATION is deducted from the allowance, so the leave type is stored
    // rather than inferred from the reason text at read time.
    const type = value.type ?? 'VACATION';
    const reason = value.reason ?? undefined;

    // The member is in this organization, the workspace is theirs, the kind is offered.
    await this.assertRequestAllowed(organizationId, technicianId, value);

    const start = new Date(value.startDate);
    const end = new Date(value.endDate);

    /*
      Not in the past. Leave keeps its rule (from tomorrow — the day itself is gone by the time
      anybody decides it); a working-day request may be about TODAY: "may I finish at 18:00".
    */
    if (leave ? start < new Date() : value.startDate < toISODateString(new Date())) {
      throw new BadRequestException({ code: 'REQUEST_IN_PAST', message: 'Cannot request time off in the past' });
    }

    /*
      Overlap. Leave collides only with leave. Any other kind collides with the same kind on
      the same day (two answers to one question) — and with leave: a remote day, changed hours
      or overtime on a day off asks to work on a day the person will not be working.
    */
    const clashes = await requestClashes(this.prisma, technicianId, value.kind, start, end);
    const sameKind = clashes.find((c) => c.kind === value.kind);
    if (sameKind) {
      throw new BadRequestException({
        code: 'TIMEOFF_OVERLAP',
        params: {
          from: toISODateString(sameKind.startDate),
          to: toISODateString(sameKind.endDate),
          status: sameKind.status,
        },
        message: 'Time-off request overlaps with an existing request',
      });
    }
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

    // Only a vacation request is refused for falling on days off; sickness is recorded as it came.
    // A request that is not leave costs no allowance at all.
    const workingDays = leave
      ? await workingDaysOf(this.calendarRules, organizationId, technicianId, start, end, type !== 'VACATION')
      : null;

    const timeOff = await this.prisma.timeOff.create({
      data: {
        ...(dto.id ? { id: dto.id } : {}),
        technicianId,
        kind: value.kind as never,
        startDate: start,
        endDate: end,
        reason,
        type: type as never,
        spaceId: value.spaceId ?? null,
        startTime: value.startTime ?? null,
        endTime: value.endTime ?? null,
        minutes: value.minutes ?? null,
        status: 'PENDING',
        workingDays,
      },
      include: {
        technician: {
          select: { id: true, firstName: true, lastName: true },
        },
        space: { select: SPACE_BRIEF },
      },
    });

    /*
      What this costs the workspace.

      The old version of this counted everyone in the ORGANIZATION who was off
      in the window and named them back to the requester. Three things were
      wrong with it and all three mattered: somebody off in Gmunden does not
      thin cover in Vöcklabruck; it counted people who do not work those days
      anyway; and it was told to the one person who cannot act on it. It is now
      the same verdict the approver will see, computed by the same service.
    */
    // Only leave thins cover; a remote day or changed hours is a day worked.
    const verdict = leave
      ? ((
          await this.cover.assessMany(organizationId, [
            { id: timeOff.id, technicianId, startDate: start, endDate: end },
          ])
        ).get(timeOff.id) ?? null)
      : null;

    /*
      Tell whoever is meant to hear about this person.

      Until now this wrote a PENDING row and told nobody at all: the only way a
      request was ever seen was somebody opening the availability calendar and
      noticing the badge. A request nobody is told about is a request nobody
      answers.

      Recipients come from the ONE routing resolver, not from a rule invented
      here. Under the 'attendance' category because leave is about this person's
      working time — the same people, and the same opt-out, as their shifts.
      An empty list is a legitimate answer and is not padded with org admins:
      that is the configured meaning of "nobody watches this member".
    */
    const { ids: watchers } = await this.notificationRouting.resolveWatchers(
      technicianId,
      organizationId,
      'attendance',
    );
    /*
      A leader's own request goes to the administrators; the only
      administrator's own is approved now (shared approvals/own-request.ts) —
      a leader is often the only one who could have decided it, and nobody
      decides their own.
    */
    const ask = await askAboutOwnRequest(this.prisma, {
      organizationId,
      subjectId: technicianId,
      kind: 'request',
      spaceIds: value.spaceId
        ? [value.spaceId]
        : (
            await this.prisma.spaceAssignment.findMany({
              where: { userId: technicianId, organizationId, ...notEndedWhere() },
              select: { spaceId: true },
            })
          ).map((a) => a.spaceId),
      usual: watchers,
    });
    if (ask.route === 'AUTOMATIC') {
      const decided = await this.decisions.approveTimeOff(
        { timeOffId: timeOff.id, organizationId, approverId: technicianId, approved: true } as never,
        true,
      );
      return success({ ...((decided as { data?: object }).data ?? timeOff), cover: verdict });
    }
    const recipientIds = ask.ids;

    if (recipientIds.length > 0) {
      emitEvent(this.notificationClient, timeOffRequestedEvent, {
        timeOffId: timeOff.id,
        organizationId,
        memberId: technicianId,
        memberName: personName(timeOff.technician),
        ...requestFacts(timeOff),
        type,
        startDate: toISODateString(start),
        endDate: toISODateString(end),
        reason: reason ?? null,
        // The approver is told what it costs at the same moment they are told
        // it exists, so the notification is worth acting on rather than a
        // prompt to go and look something up.
        cover: verdict,
        recipientIds,
      });
    }

    return success({ ...timeOff, cover: verdict });
  }
}
