import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { createHash } from 'crypto';
import {
  HOLIDAY_MAX_DAYS,
  HOLIDAY_NAME_MAX,
  PrismaService,
  SERVICE_NAMES,
  parseWeekendDays,
  success,
  resolveHolidayPlace,
} from '@hbcfield/shared';
import { CalendarRulesService } from './calendar-rules.service';
import { countryList, validCountry, validRegion } from './holiday-library';
import { Scope, DATE } from './holidays-helpers';

/** Reading a place's holidays and saving changes — moved here unchanged from holidays.service.ts. */
@Injectable()
export abstract class HolidaysBase {
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly rules: CalendarRulesService,
    @Inject(SERVICE_NAMES.NOTIFICATION) protected readonly notifications: ClientProxy,
  ) {}

  protected changed(organizationId: string) {
    this.notifications.emit('calendar_settings_changed', { organizationId });
  }

  protected assertSpaceScope(spaceId: string, scope: Scope) {
    if (scope !== undefined && !scope.includes(spaceId)) {
      throw new ForbiddenException('You do not manage that workspace');
    }
  }

  protected async assertSpace(organizationId: string, spaceId: string) {
    const s = await this.prisma.companyLocation.findFirst({
      where: { id: spaceId, organizationId },
      select: {
        id: true,
        holidayCountry: true,
        holidayRegion: true,
        detectedHolidayCountry: true,
        detectedHolidayRegion: true,
      },
    });
    if (!s) throw new NotFoundException('Workspace not found');
    return s;
  }

  protected readPlace(
    input: { weekendDays?: unknown; holidayCountry?: unknown; holidayRegion?: unknown },
    allowInherit: boolean,
  ) {
    const data: { weekendDays?: number[]; holidayCountry?: string | null; holidayRegion?: string | null } = {};
    if (input.weekendDays !== undefined) {
      const w = parseWeekendDays(input.weekendDays);
      if (!w || (!allowInherit && w.length === 0))
        throw new BadRequestException({
          code: 'WEEKEND_INVALID',
          message: 'Choose the weekend days — at least one working day must remain.',
        });
      data.weekendDays = w;
    }
    if (input.holidayCountry !== undefined) {
      if (input.holidayCountry === null || input.holidayCountry === '') {
        data.holidayCountry = null;
        data.holidayRegion = null;
      } else {
        const c = String(input.holidayCountry).toUpperCase();
        if (!validCountry(c) || !countryList().some((x) => x.code === c))
          throw new BadRequestException({
            code: 'COUNTRY_UNKNOWN',
            message: 'We do not have holidays for that country.',
          });
        data.holidayCountry = c;
      }
    }
    if (input.holidayRegion !== undefined && data.holidayCountry !== null) {
      if (input.holidayRegion === null || input.holidayRegion === '') data.holidayRegion = null;
      else if (!validRegion(input.holidayRegion))
        throw new BadRequestException({ code: 'REGION_UNKNOWN', message: 'That region is not known.' });
      else data.holidayRegion = String(input.holidayRegion);
    }
    return data;
  }

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
      this.assertSpaceScope(spaceId, dto.scopeSpaceIds);
      const space = await this.assertSpace(dto.organizationId, spaceId);
      // A library change belongs to whoever owns the list: a workspace sharing the organization's
      // (same country) cannot fork one holiday of it; one in another country — chosen or detected — can.
      const org = dto.libraryKey
        ? await this.prisma.organization.findUnique({
            where: { id: dto.organizationId },
            select: { holidayCountry: true, holidayRegion: true, country: true },
          })
        : null;
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
      if (existing.spaceId) this.assertSpaceScope(existing.spaceId, dto.scopeSpaceIds);
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
    this.changed(dto.organizationId);
    return success({ id: row.id });
  }

  /** Delete a company day, or undo a change to a library holiday (back to the country's date). */
  async remove(dto: { organizationId: string; id: string; scopeSpaceIds?: Scope }) {
    const existing = await this.prisma.calendarHoliday.findFirst({
      where: { id: dto.id, organizationId: dto.organizationId },
      select: { id: true, spaceId: true },
    });
    if (!existing) throw new NotFoundException('Holiday not found');
    if (existing.spaceId) this.assertSpaceScope(existing.spaceId, dto.scopeSpaceIds);
    else if (dto.scopeSpaceIds !== undefined)
      throw new ForbiddenException("Only an administrator changes the organization's holidays");
    await this.prisma.calendarHoliday.delete({ where: { id: existing.id } });
    this.changed(dto.organizationId);
    return success({ ok: true });
  }
}
