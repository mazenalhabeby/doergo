import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { Prisma, WorkModel, SpaceKind } from '@prisma/client';
import { rearmNoShiftSessions } from '../attendance/core/no-shift-rearm';
import { assertWorkflowInOrg } from '../../common/tenant-scope.util';
import {
  success,
  parseAutoClockSettings,
  autoClockOffered,
  isGeofencePolicy,
  isRequestKind,
  REQUEST_KINDS,
  isNoShiftPolicy,
  noShiftPolicyConflict,
  clampDailyMinutes,
  validateMinCover,
} from '@hbcfield/shared';
import { tzFromCoords, spaceCurrency, readAutoClock } from './space-helpers';
import { PrismaService } from '@hbcfield/shared';
import { SpaceAnnouncer } from './space-announcer.service';
import { spaceCompany, cleanPolygon, writeSpaceRates } from './space-write-rules';
import { siteBoundaryChanged } from './site-boundary';

/** Editing a workspace: its settings, boundary, rates, auto-clock. */
@Injectable()
export class SpaceUpdateService {
  private readonly logger = new Logger(SpaceUpdateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly announcer: SpaceAnnouncer,
  ) {}

  async update(data: {
    id: string;
    organizationId: string;
    userId: string;
    name?: string;
    address?: string;
    lat?: number;
    lng?: number;
    geofenceRadius?: number;
    geofencePolygon?: unknown;
    isActive?: boolean;
    enabledModules?: string[];
    workflowId?: string;
    workModel?: string;
    geofencePolicy?: string;
    requestKinds?: string[];
    /** The automatic clock's settings (shared attendance/auto-clock.ts); null switches it off. */
    autoClock?: unknown;
    noShiftPolicy?: string;
    noShiftDailyMinutes?: number;
    minCover?: number;
    timezone?: string;
    kind?: string;
    contactName?: string;
    contactEmail?: string;
    contactPhone?: string;
    billableRateCents?: number | null;
    costRateCents?: number | null;
    rateEffectiveFrom?: string;
    currency?: string | null;
    legalEntityId?: string | null;
    notifyRoleIds?: string[];
    contactRoleIds?: string[];
  }) {
    // Verify location exists and belongs to organization
    const existing = await this.prisma.companyLocation.findFirst({
      where: {
        id: data.id,
        organizationId: data.organizationId,
      },
    });

    if (!existing) {
      throw new NotFoundException('Company location not found');
    }

    const updateData: Prisma.CompanyLocationUncheckedUpdateInput = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.address !== undefined) updateData.address = data.address;
    if (data.lat !== undefined) updateData.lat = data.lat;
    if (data.lng !== undefined) updateData.lng = data.lng;
    // The workspace moved: where its public holidays come from is looked up again (the gateway's
    // sweep picks up a NULL stamp). With no map point left, the detected place goes too.
    if (data.lat !== undefined || data.lng !== undefined) {
      updateData.holidayDetectedAt = null;
      if (data.lat === null || data.lng === null) {
        updateData.detectedHolidayCountry = null;
        updateData.detectedHolidayRegion = null;
      }
    }
    if (data.geofenceRadius !== undefined) updateData.geofenceRadius = data.geofenceRadius;
    // Only touched when the caller actually sent the field: a PATCH that is
    // renaming the space must not wipe a boundary somebody drew.
    if ('geofencePolygon' in data) {
      // A cleared boundary is a database NULL, like a space that never had one. A plain `null` here
      // stored the JSON value null — read back the same, but "IS NULL" would count it as drawn.
      const polygon = cleanPolygon(data.geofencePolygon);
      updateData.geofencePolygon = polygon === null ? Prisma.DbNull : polygon;
    }
    // Only a move of the site itself (pin, radius, drawn area) — not a rename — is a boundary change.
    if (siteBoundaryChanged(existing, data, updateData.geofencePolygon)) updateData.boundaryChangedAt = new Date();
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.enabledModules !== undefined) updateData.enabledModules = data.enabledModules;
    if (data.workflowId !== undefined) {
      // Another tenant's state machine must not become this workspace's default task type.
      await assertWorkflowInOrg(this.prisma, data.workflowId || null, existing.organizationId);
      updateData.workflowId = data.workflowId || null;
    }
    if (data.workModel !== undefined) updateData.workModel = data.workModel as WorkModel;
    /*
      The ceiling on working away from this site.

      Validated rather than trusted: an unrecognised value would otherwise sit in
      the column and be read as STRICT by the resolver forever, which is safe but
      silent — and a setting that silently did not save is worse than one that
      refused.
    */
    if (data.geofencePolicy !== undefined) {
      if (!isGeofencePolicy(data.geofencePolicy)) {
        throw new BadRequestException('Unknown clock-in policy for this workspace');
      }
      updateData.geofencePolicy = data.geofencePolicy;
    }
    /*
      The request kinds members may ask for here — validated, not trusted, for the same reason.
      ⚠️ EMPTY MEANS EVERY KIND (requestKindsOffered); kept in the shared order, without repeats.
    */
    if (data.requestKinds !== undefined) {
      if (!Array.isArray(data.requestKinds) || !data.requestKinds.every(isRequestKind)) {
        throw new BadRequestException({
          code: 'REQUEST_KIND_INVALID',
          message: 'Unknown request kind for this workspace',
        });
      }
      updateData.requestKinds = REQUEST_KINDS.filter((k) => (data.requestKinds as string[]).includes(k));
    }
    /*
      The automatic clock — parsed STRICTLY: an out-of-range number is refused
      with the field it was, never clamped (the office must see that 500 minutes
      was not saved as 180). Stored as the parsed whole, so a read never meets a
      half-written object. The Remote bucket is not a place anybody arrives at.
    */
    if (data.autoClock !== undefined) {
      if (existing.isRemote) {
        throw new BadRequestException({
          message: 'The remote bucket has no automatic clock',
          code: 'AUTO_CLOCK_SETTING_INVALID',
          params: { field: 'autoClock' },
        });
      }
      if (data.autoClock === null) {
        updateData.autoClock = Prisma.DbNull;
      } else {
        const parsed = parseAutoClockSettings(data.autoClock, { strict: true });
        if (!parsed.ok) {
          throw new BadRequestException({
            message: `Automatic clock setting out of range: ${parsed.field}`,
            code: parsed.code,
            params: { field: parsed.field },
          });
        }
        updateData.autoClock = parsed.value as unknown as Prisma.InputJsonValue;
      }
    }
    // Clocking in with no shift — validated for the same reason as the policy above.
    if (data.noShiftPolicy !== undefined) {
      if (!isNoShiftPolicy(data.noShiftPolicy)) {
        throw new BadRequestException('Unknown rule for clocking in without a shift');
      }
      updateData.noShiftPolicy = data.noShiftPolicy;
    }
    if (data.noShiftDailyMinutes !== undefined) {
      updateData.noShiftDailyMinutes = clampDailyMinutes(data.noShiftDailyMinutes);
    }
    /*
      ⚠️ "Only with a shift" where nothing schedules shifts refuses EVERYBODY —
      no shift can ever match at a workspace with workModel NONE. Judged on the
      pair as it will be saved (either half may be the one changing). Asked only
      when one of them is in this PATCH, so a rename never trips over a row that
      already holds the pair; the clock-in reads such a row as ALLOW.
    */
    if (data.noShiftPolicy !== undefined || data.workModel !== undefined) {
      const conflict = noShiftPolicyConflict(
        data.noShiftPolicy ?? existing.noShiftPolicy,
        data.workModel ?? existing.workModel,
      );
      if (conflict) {
        throw new BadRequestException({
          message:
            'Clocking in only with a shift needs a workspace that schedules shifts. ' +
            'Choose a work model with shifts first, or allow clocking in without one.',
          code: conflict,
        });
      }
    }
    /*
      The staffing floor. Validated through the shared rule rather than trusted,
      for the same reason as the policy above — and 0 is a legitimate value
      meaning "no floor", not a missing one, so it must survive the round trip.
    */
    if (data.minCover !== undefined) {
      try {
        updateData.minCover = validateMinCover(data.minCover);
      } catch (e) {
        throw new BadRequestException((e as Error).message);
      }
    }
    // Ownership kind + customer contact fields.
    if (data.kind !== undefined) updateData.kind = data.kind as SpaceKind;
    if (data.contactName !== undefined) updateData.contactName = data.contactName || null;
    if (data.contactEmail !== undefined) updateData.contactEmail = data.contactEmail || null;
    if (data.contactPhone !== undefined) updateData.contactPhone = data.contactPhone || null;
    /*
      The currency this workspace bills in. ⚠️ Its rates are plain numbers, so a
      switch re-reads every one of them in the new currency — the screen says so
      before it sends this. Issued invoices keep their own currency.
    */
    if (data.currency !== undefined) updateData.currency = spaceCurrency(data.currency);
    // Who invoices it. Issued invoices keep the company frozen on them.
    if (data.legalEntityId !== undefined)
      updateData.legalEntityId = await spaceCompany(this.prisma, data.organizationId, data.legalEntityId);
    /*
      Rates are NOT written here: they go through `writeSpaceRates` below — a
      dated history row and then the column — so a change never re-prices work
      already done. (This used to turn a typed 0 into "inherit"; zero is a real
      rate, and the shared cleaner keeps it.)
    */
    // Space-driven routing (Phase 3): which roles are notified about / contactable
    // by members here. Whitelist to string arrays (fail closed).
    if (Array.isArray(data.notifyRoleIds)) {
      updateData.notifyRoleIds = data.notifyRoleIds.filter((x): x is string => typeof x === 'string');
    }
    if (Array.isArray(data.contactRoleIds)) {
      updateData.contactRoleIds = data.contactRoleIds.filter((x): x is string => typeof x === 'string');
    }
    // Timezone: an explicit value wins; otherwise, when coordinates change,
    // re-derive the space's timezone from the new location.
    if (data.timezone !== undefined) {
      updateData.timezone = data.timezone;
    } else if (data.lat !== undefined || data.lng !== undefined) {
      const derived = tzFromCoords(data.lat ?? existing.lat, data.lng ?? existing.lng);
      if (derived) updateData.timezone = derived;
    }

    const wasOn = !!autoClockOffered({ settings: existing.autoClock, assignmentAutoClock: true });
    const hoursBefore = existing.noShiftDailyMinutes;
    await this.prisma.companyLocation.update({
      where: { id: data.id },
      data: updateData,
    });
    await writeSpaceRates(this.prisma, data.id, data.organizationId, data, data.userId);
    const location = await this.prisma.companyLocation.findUniqueOrThrow({ where: { id: data.id } });

    this.logger.log(`Company location updated: ${location.id}`);
    // Its hours without a shift changed → the sessions running there follow now, not tomorrow.
    if (data.noShiftDailyMinutes !== undefined && location.noShiftDailyMinutes !== hoursBefore) {
      await rearmNoShiftSessions(this.prisma, {
        spaceId: location.id,
        organizationId: data.organizationId,
        fromMinutes: hoursBefore,
        toMinutes: location.noShiftDailyMinutes,
      }).catch((err) => this.logger.error(`Re-timing running sessions in ${location.id} failed: ${err}`));
    }
    this.announcer.announce('space_changed', data.organizationId, location.id);
    // The workspace's automatic clock switched ON → the members already chosen here learn the switch is there.
    if (
      data.autoClock !== undefined &&
      !wasOn &&
      autoClockOffered({ settings: location.autoClock, assignmentAutoClock: true })
    ) {
      void this.announcer.offerAutoClock(data.organizationId, location.id);
    }
    return success(
      { ...location, autoClock: readAutoClock(location.autoClock) },
      'Company location updated successfully',
    );
  }
}
