import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { resolveWeekend, success, resolveHolidayPlace, clampListLimit } from '@hbcfield/shared';
import { countryList, matchRegion, regionList, validCountry } from './holiday-library';
import { Scope } from './holidays-helpers';
import { HolidaysBase } from './holidays.base';

/**
 * Holidays & weekends — the settings behind the calendar.
 *
 * Writes are narrow on purpose: the organization layer needs org-wide authority, a workspace layer
 * needs authority IN that workspace (checked here against the real space id, never trusted from the
 * guard alone). Every write tells the organization's screens to refresh, because a moved Eid changes
 * leave counts and shading everywhere at once.
 */
@Injectable()
export class HolidaysService extends HolidaysBase {

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
      select: {
        id: true,
        name: true,
        weekendDays: true,
        holidayCountry: true,
        holidayRegion: true,
        detectedHolidayCountry: true,
        detectedHolidayRegion: true,
        lat: true,
        _count: { select: { spaceAssignments: true } },
      },
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
  async setDetectedPlace(dto: {
    organizationId: string;
    spaceId: string;
    country: string | null;
    stateCode?: string | null;
    stateName?: string | null;
  }) {
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

  /** The organization layer. Gateway: org-wide canManageWorkspaces (or admin). */
  async updateOrganization(dto: {
    organizationId: string;
    weekendDays?: unknown;
    holidayCountry?: unknown;
    holidayRegion?: unknown;
    calendarFeedsEnabled?: unknown;
  }) {
    const data: Record<string, unknown> = this.readPlace(dto, false);
    if (data.holidayRegion !== undefined && data.holidayCountry === undefined) {
      const org = await this.prisma.organization.findUnique({
        where: { id: dto.organizationId },
        select: { holidayCountry: true, country: true },
      });
      const c = org?.holidayCountry || org?.country;
      if (data.holidayRegion && c && !regionList(c).some((r) => r.code === data.holidayRegion))
        throw new BadRequestException({ code: 'REGION_UNKNOWN', message: 'That region is not known.' });
    } else if (
      data.holidayRegion &&
      typeof data.holidayCountry === 'string' &&
      !regionList(data.holidayCountry).some((r) => r.code === data.holidayRegion)
    ) {
      throw new BadRequestException({ code: 'REGION_UNKNOWN', message: 'That region is not known.' });
    }
    if (dto.calendarFeedsEnabled !== undefined) {
      if (typeof dto.calendarFeedsEnabled !== 'boolean') throw new BadRequestException('calendarFeedsEnabled must be true or false');
      data.calendarFeedsEnabled = dto.calendarFeedsEnabled;
      // Switching feeds off revokes every existing link, not just new ones.
      if (!dto.calendarFeedsEnabled) await this.prisma.calendarFeedToken.deleteMany({ where: { organizationId: dto.organizationId } });
    }
    /*
      ⚠️ A write to `Organization`, which auth-service owns — deliberately here.
      The columns are the calendar's own (weekendDays, holidayCountry/Region,
      calendarFeedsEnabled), read only by this service, and switching feeds off
      must happen with the token wipe above. auth-service's
      `update_org_profile` is the profile contract (name, address, currency) and
      knows none of them. `data` is built by `readPlace` + the feed switch only,
      so nothing outside those four columns can be written through this path.
    */
    await this.prisma.organization.update({ where: { id: dto.organizationId }, data });
    this.changed(dto.organizationId);
    return success({ ok: true });
  }

  /** One workspace's layer. Empty weekend / null country = inherit the organization's. */
  async updateWorkspace(dto: {
    organizationId: string;
    spaceId: string;
    scopeSpaceIds?: Scope;
    weekendDays?: unknown;
    holidayCountry?: unknown;
    holidayRegion?: unknown;
  }) {
    this.assertSpaceScope(dto.spaceId, dto.scopeSpaceIds);
    await this.assertSpace(dto.organizationId, dto.spaceId);
    const data = this.readPlace(dto, true);
    if (
      data.holidayRegion &&
      typeof data.holidayCountry === 'string' &&
      !regionList(data.holidayCountry).some((r) => r.code === data.holidayRegion)
    ) {
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
}
