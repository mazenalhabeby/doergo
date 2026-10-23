import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import {
  notEndedWhere,
  EVENT_MAX_ATTENDEES,
  PrismaService,
  isAdmin,
  peopleNames,
  staffInNoWorkspace,
} from '@hbcfield/shared';
import { CalendarRulesService } from './calendar-rules.service';
import { Caller } from './events-helpers';

/** Who may be put on an event: colleagues the caller shares a workspace with (anyone, for those who see it all). */
@Injectable()
export class EventPeopleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rules: CalendarRulesService,
  ) {}

  /** The colleagues this caller may put on an event: people they share a workspace with. */
  async inviteable(
    caller: Caller,
    ids: string[],
  ): Promise<Map<string, { id: string; firstName: string; lastName: string }>> {
    const unique = [...new Set(ids.filter((id) => typeof id === 'string' && id && id !== caller.userId))].slice(
      0,
      EVENT_MAX_ATTENDEES + 1,
    );
    if (unique.length > EVENT_MAX_ATTENDEES)
      throw new BadRequestException({
        code: 'EVENT_TOO_MANY_PEOPLE',
        message: `At most ${EVENT_MAX_ATTENDEES} people.`,
      });
    if (!unique.length) return new Map();
    const people = await peopleNames(this.prisma, unique, {
      organizationId: caller.organizationId,
      active: true,
      staffOnly: true,
    });
    if (people.length !== unique.length)
      throw new BadRequestException({
        code: 'EVENT_PERSON_UNKNOWN',
        message: 'Somebody on the list is not a colleague here.',
      });
    if (!(isAdmin({ role: caller.role as string }) || caller.canManageUsers || caller.orgWideView)) {
      const circle = await this.circleOf(caller);
      const outside = people.filter((p) => !circle.has(p.id));
      if (outside.length)
        throw new ForbiddenException({
          code: 'EVENT_PERSON_NOT_REACHABLE',
          message: 'You can invite people you work with in a workspace.',
        });
    }
    return new Map(people.map((p) => [p.id, p]));
  }

  /** People who share a workspace with the caller — or, for somebody in none, everyone else in none. */
  async circleOf(caller: Caller): Promise<Set<string>> {
    const mine = await this.rules.workspacesOf(caller.organizationId, caller.userId);
    if (!mine.length) {
      return new Set(await staffInNoWorkspace(this.prisma, caller.organizationId));
    }
    const rows = await this.prisma.spaceAssignment.findMany({
      where: { organizationId: caller.organizationId, spaceId: { in: mine }, ...notEndedWhere() },
      select: { userId: true },
    });
    return new Set(rows.map((r) => r.userId));
  }
}
