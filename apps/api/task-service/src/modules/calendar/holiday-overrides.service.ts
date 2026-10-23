import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { createHash } from 'crypto';
import {
  HOLIDAY_MAX_DAYS,
  HOLIDAY_NAME_MAX,
  PrismaService,
  SERVICE_NAMES,
  success,
  resolveHolidayPlace,
  orgHolidayPlace,
} from '@hbcfield/shared';
import { Scope, DATE } from './holidays-helpers';
import { announceCalendarChange, assertSpaceScope, findWorkspace } from './holiday-writes';

/**
 * The organization's own changes to holidays: confirm, move, rename, half day, don't observe, a
 * company day — and undoing one. Library changes are stored on the layer that chose the country.
 */
@Injectable()
export class HolidayOverridesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SERVICE_NAMES.NOTIFICATION) private readonly notifications: ClientProxy,
  ) {}

  /**
   * Change a library holiday for one year (confirm, move, rename, half day, don't observe), or add a
   * company day. Library changes are stored on the layer that chose the country.
   */
  async save(dto: {
    organizationId: string;
    userId: string;
    spaceId?: string | null;
    scopeSpaceIds?: Scope;
    id?: string;
    libraryKey?: string | null;
    date: string;
    days?: number;
    name: string;
    halfDay?: boolean;
    confirmed?: boolean;
    removed?: boolean;
  }) {
    if (!DATE.test(dto.date ?? '')) throw new BadRequestException('Choose a date');
    const days = dto.days ?? 1;
    if (!Number.isInteger(days) || days < 1 || days > HOLIDAY_MAX_DAYS)
      throw new BadRequestException(`A holiday lasts 1 to ${HOLIDAY_MAX_DAYS} days`);
    const name = String(dto.name ?? '')
      .trim()
      .slice(0, HOLIDAY_NAME_MAX);
    if (!name) throw new BadRequestException('Give the day a name');

    let spaceId: string | null = dto.spaceId || null;
    if (spaceId) {
      assertSpaceScope(spaceId, dto.scopeSpaceIds);
      const space = await findWorkspace(this.prisma, dto.organizationId, spaceId);
      // A library change belongs to whoever owns the list: a workspace sharing the organization's
      // (same country) cannot fork one holiday of it; one in another country — chosen or detected — can.
      const org = dto.libraryKey ? await orgHolidayPlace(this.prisma, dto.organizationId) : null;
      if (dto.libraryKey && !(org && resolveHolidayPlace(org, space).ownLayer)) {
        if (dto.scopeSpaceIds !== undefined)
          throw new ForbiddenException(
            "This workspace uses the organization's holidays — ask an administrator, " +
              'or give it its own country first.',
          );
        spaceId = null;
      }
    } else if (dto.scopeSpaceIds !== undefined) {
      throw new ForbiddenException("Only an administrator changes the organization's holidays");
    }

    const libraryKey = dto.libraryKey ? String(dto.libraryKey).slice(0, 100) : null;
    const data = {
      date: new Date(`${dto.date}T00:00:00Z`),
      days,
      name,
      halfDay: !!dto.halfDay,
      confirmed: !!dto.confirmed,
      removed: !!dto.removed,
    };
    let row;
    if (dto.id) {
      const existing = await this.prisma.calendarHoliday.findFirst({
        where: { id: dto.id, organizationId: dto.organizationId },
        select: { id: true, spaceId: true },
      });
      if (!existing) throw new NotFoundException('Holiday not found');
      if (existing.spaceId) assertSpaceScope(existing.spaceId, dto.scopeSpaceIds);
      else if (dto.scopeSpaceIds !== undefined)
        throw new ForbiddenException("Only an administrator changes the organization's holidays");
      row = await this.prisma.calendarHoliday.update({ where: { id: existing.id }, data });
    } else if (libraryKey) {
      /*
        One override per (layer, holiday), BY CONSTRUCTION: its id is derived from the three, so a
        double-click or two admins at once upsert the same row instead of making two.
      */
      const id = `hol_${createHash('sha256')
        .update(`${dto.organizationId}|${spaceId ?? ''}|${libraryKey}`)
        .digest('hex')
        .slice(0, 24)}`;
      row = await this.prisma.calendarHoliday.upsert({
        where: { id },
        create: { ...data, id, organizationId: dto.organizationId, spaceId, libraryKey, createdById: dto.userId },
        update: data,
      });
    } else {
      row = await this.prisma.calendarHoliday.create({
        data: {
          ...data,
          removed: false,
          confirmed: true,
          organizationId: dto.organizationId,
          spaceId,
          libraryKey: null,
          createdById: dto.userId,
        },
      });
    }
    announceCalendarChange(this.notifications, dto.organizationId);
    return success({ id: row.id });
  }

  /** Delete a company day, or undo a change to a library holiday (back to the country's date). */
  async remove(dto: { organizationId: string; id: string; scopeSpaceIds?: Scope }) {
    const existing = await this.prisma.calendarHoliday.findFirst({
      where: { id: dto.id, organizationId: dto.organizationId },
      select: { id: true, spaceId: true },
    });
    if (!existing) throw new NotFoundException('Holiday not found');
    if (existing.spaceId) assertSpaceScope(existing.spaceId, dto.scopeSpaceIds);
    else if (dto.scopeSpaceIds !== undefined)
      throw new ForbiddenException("Only an administrator changes the organization's holidays");
    await this.prisma.calendarHoliday.delete({ where: { id: existing.id } });
    announceCalendarChange(this.notifications, dto.organizationId);
    return success({ ok: true });
  }
}
