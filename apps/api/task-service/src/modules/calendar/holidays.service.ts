import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { createHash } from 'crypto';
import {
  HOLIDAY_MAX_DAYS,
  HOLIDAY_NAME_MAX,
  PrismaService,
  SERVICE_NAMES,
  parseWeekendDays,
  resolveWeekend,
  success,
  resolveHolidayPlace,
  clampListLimit,
} from '@hbcfield/shared';
import { CalendarRulesService } from './calendar-rules.service';
import { countryList, matchRegion, regionList, validCountry, validRegion } from './holiday-library';

/** undefined = org-wide authority, [ids] = only these workspaces, [] = nowhere. */
type Scope = string[] | undefined;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Holidays & weekends — the settings behind the calendar.
 *
 * Writes are narrow on purpose: the organization layer needs org-wide authority, a workspace layer
 * needs authority IN that workspace (checked here against the real space id, never trusted from the
 * guard alone). Every write tells the organization's screens to refresh, because a moved Eid changes
 * leave counts and shading everywhere at once.
 */
@Injectable()
export class HolidaysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rules: CalendarRulesService,
    @Inject(SERVICE_NAMES.NOTIFICATION) private readonly notifications: ClientProxy,
  ) {}

  private changed(organizationId: string) {
    this.notifications.emit('calendar_settings_changed', { organizationId });
  }

  private assertSpaceScope(spaceId: string, scope: Scope) {
    if (scope !== undefined && !scope.includes(spaceId)) {
      throw new ForbiddenException('You do not manage that workspace');
    }
  }

  private async assertSpace(organizationId: string, spaceId: string) {
    const s = await this.prisma.companyLocation.findFirst({ where: { id: spaceId, organizationId }, select: { id: true, holidayCountry: true, holidayRegion: true, detectedHolidayCountry: true, detectedHolidayRegion: true } });
    if (!s) throw new NotFoundException('Workspace not found');
    return s;
  }

  /** Everything the settings screen shows, in one read. */
  async settings(dto: { organizationId: string; year?: number; lang?: string; scopeSpaceIds?: Scope }) {
    const year = Number.isInteger(dto.year) ? dto.year! : new Date().getFullYear();
    const from = `${year}-01-01`, to = `${year}-12-31`;
    const org = await this.prisma.organization.findUnique({
      where: { id: dto.organizationId },
      select: { weekendDays: true, holidayCountry: true, holidayRegion: true, country: true, calendarFeedsEnabled: true },
    });
    if (!org) throw new NotFoundException('Organization not found');
    const spaces = await this.prisma.companyLocation.findMany({
      where: {
        organizationId: dto.organizationId, isActive: true, isRemote: false,
        ...(dto.scopeSpaceIds !== undefined ? { id: { in: dto.scopeSpaceIds } } : {}),
      },
      select: { id: true, name: true, weekendDays: true, holidayCountry: true, holidayRegion: true, detectedHolidayCountry: true, detectedHolidayRegion: true, lat: true, _count: { select: { spaceAssignments: true } } },
      orderBy: { name: 'asc' },
    });
    const places = await this.rules.places(dto.organizationId, spaces.map((s) => s.id), from, to, dto.lang);
    const summary = (id: string | null) => {
      const p = places.get(id);
      return {
        holidayCount: p?.holidays.length ?? 0,
        estimatedCount: p?.holidays.filter((h) => h.status === 'ESTIMATED').length ?? 0,
        country: p?.place.country ?? null,
        region: p?.place.region ?? null,
        weekend: p?.place.weekend ?? resolveWeekend(org.weekendDays),
      };
    };
    return success({
      year,
      organization: {
        weekendDays: org.weekendDays,
        holidayCountry: org.holidayCountry,
        holidayRegion: org.holidayRegion,
        addressCountry: org.country,
        calendarFeedsEnabled: org.calendarFeedsEnabled,
        ...summary(null),
      },
      workspaces: spaces.map((s) => ({
        id: s.id,
        name: s.name,
        weekendDays: s.weekendDays,
        holidayCountry: s.holidayCountry,
        holidayRegion: s.holidayRegion,
        people: s._count.spaceAssignments,
        ...summary(s.id),
        inherited: places.get(s.id)?.place.inherited ?? { weekend: true, holidays: true },
        holidaySource: places.get(s.id)?.place.holidaySource ?? 'ORGANIZATION',
        // Holiday changes made on this workspace apply to it alone (another country), else they are the organization's.
        ownList: resolveHolidayPlace(org, s).ownLayer,
        detectedCountry: s.detectedHolidayCountry,
        detectedRegion: s.detectedHolidayRegion,
        hasLocation: s.lat != null,
      })),
    });
  }

  /**
   * Where a workspace IS, as the gateway's geocoder read its map point: a country code and the
   * state as the geocoder names it. Stored once; the calendar never geocodes on a read.
   *
   * A country the holiday library does not know is stored as nothing (the organization's applies);
   * a state it cannot match leaves the country alone. `country: null` (no answer, or the location was
   * cleared) clears the detection and still stamps the attempt, so the backfill does not ask again.
   */
  async setDetectedPlace(dto: { organizationId: string; spaceId: string; country: string | null; stateCode?: string | null; stateName?: string | null }) {
    const c = typeof dto.country === 'string' ? dto.country.trim().toUpperCase() : null;
    const known = c && validCountry(c) && countryList('en').some((x) => x.code === c) ? c : null;
    const region = known ? matchRegion(known, [dto.stateCode, dto.stateName]) : null;
    const res = await this.prisma.companyLocation.updateMany({
      where: { id: dto.spaceId, organizationId: dto.organizationId },
      data: { detectedHolidayCountry: known, detectedHolidayRegion: region, holidayDetectedAt: new Date() },
    });
    return success({ updated: res.count, country: known, region });
  }

  /** Workspaces with a map point that were never looked up — the one-off backfill, a page at a time. */
  async placesToDetect(dto: { limit?: number }) {
    const take = clampListLimit(dto.limit, 50, 200);
    const rows = await this.prisma.companyLocation.findMany({
      where: { holidayDetectedAt: null, lat: { not: null }, lng: { not: null }, isRemote: false },
      select: { id: true, organizationId: true, lat: true, lng: true },
      orderBy: { createdAt: 'asc' },
      take,
    });
    return success(rows);
  }

  async countries(dto: { lang?: string }) {
    return success(countryList(dto.lang));
  }

  async regions(dto: { country: string; lang?: string }) {
    return success(regionList(String(dto.country ?? '').toUpperCase(), dto.lang));
  }

  private readPlace(input: { weekendDays?: unknown; holidayCountry?: unknown; holidayRegion?: unknown }, allowInherit: boolean) {
    const data: { weekendDays?: number[]; holidayCountry?: string | null; holidayRegion?: string | null } = {};
    if (input.weekendDays !== undefined) {
      const w = parseWeekendDays(input.weekendDays);
      if (!w || (!allowInherit && w.length === 0)) throw new BadRequestException({ code: 'WEEKEND_INVALID', message: 'Choose the weekend days — at least one working day must remain.' });
      data.weekendDays = w;
    }
    if (input.holidayCountry !== undefined) {
      if (input.holidayCountry === null || input.holidayCountry === '') {
        data.holidayCountry = null;
        data.holidayRegion = null;
      } else {
        const c = String(input.holidayCountry).toUpperCase();
        if (!validCountry(c) || !countryList().some((x) => x.code === c)) throw new BadRequestException({ code: 'COUNTRY_UNKNOWN', message: 'We do not have holidays for that country.' });
        data.holidayCountry = c;
      }
    }
    if (input.holidayRegion !== undefined && data.holidayCountry !== null) {
      if (input.holidayRegion === null || input.holidayRegion === '') data.holidayRegion = null;
      else if (!validRegion(input.holidayRegion)) throw new BadRequestException({ code: 'REGION_UNKNOWN', message: 'That region is not known.' });
      else data.holidayRegion = String(input.holidayRegion);
    }
    return data;
  }

  /** The organization layer. Gateway: org-wide canManageWorkspaces (or admin). */
  async updateOrganization(dto: { organizationId: string; weekendDays?: unknown; holidayCountry?: unknown; holidayRegion?: unknown; calendarFeedsEnabled?: unknown }) {
    const data: Record<string, unknown> = this.readPlace(dto, false);
    if (data.holidayRegion !== undefined && data.holidayCountry === undefined) {
      const org = await this.prisma.organization.findUnique({ where: { id: dto.organizationId }, select: { holidayCountry: true, country: true } });
      const c = org?.holidayCountry || org?.country;
      if (data.holidayRegion && c && !regionList(c).some((r) => r.code === data.holidayRegion)) throw new BadRequestException({ code: 'REGION_UNKNOWN', message: 'That region is not known.' });
    } else if (data.holidayRegion && typeof data.holidayCountry === 'string' && !regionList(data.holidayCountry).some((r) => r.code === data.holidayRegion)) {
      throw new BadRequestException({ code: 'REGION_UNKNOWN', message: 'That region is not known.' });
    }
    if (dto.calendarFeedsEnabled !== undefined) {
      if (typeof dto.calendarFeedsEnabled !== 'boolean') throw new BadRequestException('calendarFeedsEnabled must be true or false');
      data.calendarFeedsEnabled = dto.calendarFeedsEnabled;
      // Switching feeds off revokes every existing link, not just new ones.
      if (!dto.calendarFeedsEnabled) await this.prisma.calendarFeedToken.deleteMany({ where: { organizationId: dto.organizationId } });
    }
    await this.prisma.organization.update({ where: { id: dto.organizationId }, data });
    this.changed(dto.organizationId);
    return success({ ok: true });
  }

  /** One workspace's layer. Empty weekend / null country = inherit the organization's. */
  async updateWorkspace(dto: { organizationId: string; spaceId: string; scopeSpaceIds?: Scope; weekendDays?: unknown; holidayCountry?: unknown; holidayRegion?: unknown }) {
    this.assertSpaceScope(dto.spaceId, dto.scopeSpaceIds);
    await this.assertSpace(dto.organizationId, dto.spaceId);
    const data = this.readPlace(dto, true);
    if (data.holidayRegion && typeof data.holidayCountry === 'string' && !regionList(data.holidayCountry).some((r) => r.code === data.holidayRegion)) {
      throw new BadRequestException({ code: 'REGION_UNKNOWN', message: 'That region is not known.' });
    }
    await this.prisma.companyLocation.update({ where: { id: dto.spaceId }, data });
    this.changed(dto.organizationId);
    return success({ ok: true });
  }

  /** One year of holidays for the organization or a workspace, removed ones included so they can be restored. */
  async list(dto: { organizationId: string; spaceId?: string | null; year?: number; lang?: string }) {
    const year = Number.isInteger(dto.year) ? dto.year! : new Date().getFullYear();
    const place = await this.rules.place(dto.organizationId, dto.spaceId || null, `${year}-01-01`, `${year}-12-31`, dto.lang, true);
    if (!place) throw new NotFoundException('Workspace not found');
    return success({ year, place: place.place, holidays: place.holidays });
  }

  /**
   * Change a library holiday for one year (confirm, move, rename, half day, don't observe), or add a
   * company day. Library changes are stored on the layer that chose the country.
   */
  async save(dto: {
    organizationId: string; userId: string; spaceId?: string | null; scopeSpaceIds?: Scope;
    id?: string; libraryKey?: string | null; date: string; days?: number; name: string;
    halfDay?: boolean; confirmed?: boolean; removed?: boolean;
  }) {
    if (!DATE.test(dto.date ?? '')) throw new BadRequestException('Choose a date');
    const days = dto.days ?? 1;
    if (!Number.isInteger(days) || days < 1 || days > HOLIDAY_MAX_DAYS) throw new BadRequestException(`A holiday lasts 1 to ${HOLIDAY_MAX_DAYS} days`);
    const name = String(dto.name ?? '').trim().slice(0, HOLIDAY_NAME_MAX);
    if (!name) throw new BadRequestException('Give the day a name');

    let spaceId: string | null = dto.spaceId || null;
    if (spaceId) {
      this.assertSpaceScope(spaceId, dto.scopeSpaceIds);
      const space = await this.assertSpace(dto.organizationId, spaceId);
      // A library change belongs to whoever owns the list: a workspace sharing the organization's
      // (same country) cannot fork one holiday of it; one in another country — chosen or detected — can.
      const org = dto.libraryKey
        ? await this.prisma.organization.findUnique({ where: { id: dto.organizationId }, select: { holidayCountry: true, holidayRegion: true, country: true } })
        : null;
      if (dto.libraryKey && !(org && resolveHolidayPlace(org, space).ownLayer)) {
        if (dto.scopeSpaceIds !== undefined) throw new ForbiddenException('This workspace uses the organization\'s holidays — ask an administrator, or give it its own country first.');
        spaceId = null;
      }
    } else if (dto.scopeSpaceIds !== undefined) {
      throw new ForbiddenException('Only an administrator changes the organization\'s holidays');
    }

    const libraryKey = dto.libraryKey ? String(dto.libraryKey).slice(0, 100) : null;
    const data = {
      date: new Date(`${dto.date}T00:00:00Z`), days, name,
      halfDay: !!dto.halfDay, confirmed: !!dto.confirmed, removed: !!dto.removed,
    };
    let row;
    if (dto.id) {
      const existing = await this.prisma.calendarHoliday.findFirst({ where: { id: dto.id, organizationId: dto.organizationId }, select: { id: true, spaceId: true } });
      if (!existing) throw new NotFoundException('Holiday not found');
      if (existing.spaceId) this.assertSpaceScope(existing.spaceId, dto.scopeSpaceIds);
      else if (dto.scopeSpaceIds !== undefined) throw new ForbiddenException('Only an administrator changes the organization\'s holidays');
      row = await this.prisma.calendarHoliday.update({ where: { id: existing.id }, data });
    } else if (libraryKey) {
      /*
        One override per (layer, holiday), BY CONSTRUCTION: its id is derived from the three, so a
        double-click or two admins at once upsert the same row instead of making two.
      */
      const id = `hol_${createHash('sha256').update(`${dto.organizationId}|${spaceId ?? ''}|${libraryKey}`).digest('hex').slice(0, 24)}`;
      row = await this.prisma.calendarHoliday.upsert({
        where: { id },
        create: { ...data, id, organizationId: dto.organizationId, spaceId, libraryKey, createdById: dto.userId },
        update: data,
      });
    } else {
      row = await this.prisma.calendarHoliday.create({ data: { ...data, removed: false, confirmed: true, organizationId: dto.organizationId, spaceId, libraryKey: null, createdById: dto.userId } });
    }
    this.changed(dto.organizationId);
    return success({ id: row.id });
  }

  /** Delete a company day, or undo a change to a library holiday (back to the country's date). */
  async remove(dto: { organizationId: string; id: string; scopeSpaceIds?: Scope }) {
    const existing = await this.prisma.calendarHoliday.findFirst({ where: { id: dto.id, organizationId: dto.organizationId }, select: { id: true, spaceId: true } });
    if (!existing) throw new NotFoundException('Holiday not found');
    if (existing.spaceId) this.assertSpaceScope(existing.spaceId, dto.scopeSpaceIds);
    else if (dto.scopeSpaceIds !== undefined) throw new ForbiddenException('Only an administrator changes the organization\'s holidays');
    await this.prisma.calendarHoliday.delete({ where: { id: existing.id } });
    this.changed(dto.organizationId);
    return success({ ok: true });
  }
}
