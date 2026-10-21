import type { Prisma, JoinPolicy } from '@prisma/client';
import { ORG_NOTIFICATION_PREF_KEYS, pickBooleanPrefs, parseLeavePolicy } from '@hbcfield/shared';
import { Injectable, Logger, HttpStatus } from '@nestjs/common';
import { PrismaService } from '@hbcfield/shared';
import { ORG_CODE_LENGTH, ORG_CODE_CHARSET, hashCode, generateSecureCode } from '@hbcfield/shared';
import { LEAVE_POLICY_SELECT, leavePolicyOf, LEAVE_POLICY_REFUSALS } from './onboarding-helpers';
import { jsonColumn } from '../../common/records/json-column';

/**
 * Organization settings: join code and policy, leave policy, profile badges,
 * notification and security settings.
 */
@Injectable()
export class OrgSettingsService {
  private readonly logger = new Logger(OrgSettingsService.name);

  constructor(
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Regenerate org join code (admin action).
   */
  async regenerateJoinCode(organizationId: string) {
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId } });

    if (!org) {
      return { success: false, statusCode: HttpStatus.NOT_FOUND, message: 'Organization not found' };
    }

    const joinCode = generateSecureCode(ORG_CODE_LENGTH, ORG_CODE_CHARSET);
    const joinCodeHash = hashCode(joinCode);

    await this.prisma.organization.update({
      where: { id: organizationId },
      data: { joinCode, joinCodeHash },
    });

    this.logger.log(`Join code regenerated for org ${organizationId}`);

    return {
      success: true,
      data: { joinCode },
    };
  }

  /**
   * Get join code info for an organization.
   */
  async getJoinCode(organizationId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { joinCode: true, joinCodeHash: true, joinPolicy: true },
    });

    if (!org) {
      return { success: false, statusCode: HttpStatus.NOT_FOUND, message: 'Organization not found' };
    }

    return {
      success: true,
      data: {
        hasJoinCode: !!org.joinCodeHash,
        joinCode: org.joinCode || null,
        joinPolicy: org.joinPolicy,
      },
    };
  }

  /**
   * Update organization join policy.
   */
  async updateJoinPolicy(organizationId: string, joinPolicy: string) {
    const validPolicies = ['OPEN', 'INVITE_ONLY', 'CLOSED'];
    if (!validPolicies.includes(joinPolicy)) {
      return { success: false, statusCode: HttpStatus.BAD_REQUEST, message: 'Invalid join policy' };
    }

    await this.prisma.organization.update({
      where: { id: organizationId },
      data: { joinPolicy: joinPolicy as JoinPolicy }, // checked against validPolicies above
    });

    this.logger.log(`Join policy updated to ${joinPolicy} for org ${organizationId}`);

    return { success: true, data: { joinPolicy } };
  }

  /**
   * The organization's leave policy (shared leave/leave-api.ts parseLeavePolicy): the annual
   * days for members with no override (0 is legitimate — contractors; a typed 250 is a slip, so
   * bounded), the leave year (calendar or work year), the carry-over rule, and the day HBCField
   * started counting leave. Every field optional; what is not sent is left as it is.
   */
  async updateLeavePolicy(organizationId: string, raw: unknown) {
    const parsed = parseLeavePolicy(raw);
    if (!parsed.ok) {
      return {
        success: false,
        statusCode: HttpStatus.BAD_REQUEST,
        code: parsed.code,
        message: LEAVE_POLICY_REFUSALS[parsed.code],
      };
    }
    const v = parsed.value;
    const data = {
      ...(v.defaultLeaveAllowance !== undefined ? { defaultLeaveAllowance: v.defaultLeaveAllowance } : {}),
      ...(v.leaveYearMode !== undefined ? { leaveYearMode: v.leaveYearMode as never } : {}),
      ...(v.carryOverMode !== undefined ? { carryOverMode: v.carryOverMode as never } : {}),
      ...(v.carryOverMaxDays !== undefined ? { carryOverMaxDays: v.carryOverMaxDays } : {}),
      ...(v.carryExpiresAfterMonths !== undefined ? { carryExpiresAfterMonths: v.carryExpiresAfterMonths } : {}),
      ...(v.leaveTrackingStartedOn !== undefined
        ? {
            leaveTrackingStartedOn: v.leaveTrackingStartedOn ? new Date(`${v.leaveTrackingStartedOn}T00:00:00Z`) : null,
          }
        : {}),
    };
    const org = await this.prisma.organization.update({
      where: { id: organizationId },
      data,
      select: LEAVE_POLICY_SELECT,
    });

    this.logger.log(`Leave policy updated for org ${organizationId}: ${Object.keys(data).join(', ')}`);
    return { success: true, data: leavePolicyOf(org) };
  }

  async updateProfileBadges(organizationId: string, sent: unknown) {
    const profileBadges = sent as { showRole?: unknown; showSpecialty?: unknown } | null | undefined;
    // Validate the shape
    const valid =
      profileBadges &&
      typeof profileBadges === 'object' &&
      typeof profileBadges.showRole === 'boolean' &&
      typeof profileBadges.showSpecialty === 'boolean';

    if (!valid) {
      return { success: false, statusCode: HttpStatus.BAD_REQUEST, message: 'Invalid profile badges config' };
    }

    await this.prisma.organization.update({
      where: { id: organizationId },
      data: { profileBadges: jsonColumn(profileBadges) },
    });

    return { success: true, data: { profileBadges } };
  }

  async getProfileBadges(organizationId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { profileBadges: true },
    });

    return { success: true, data: { profileBadges: org?.profileBadges || null } };
  }

  /**
   * The organization's notification switches — for the three member emails,
   * the CEILING no member can lift (see notifications/email-prefs in shared).
   *
   * MERGED, and only known boolean keys: a screen that sends part of the set
   * must not reset the rest to "unset", which for an email means ON.
   */
  async updateNotificationPrefs(organizationId: string, prefs: unknown) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { notificationPrefs: true },
    });
    if (!org) {
      return { success: false, statusCode: HttpStatus.NOT_FOUND, message: 'Organization not found' };
    }
    const merged = {
      ...pickBooleanPrefs(org.notificationPrefs, ORG_NOTIFICATION_PREF_KEYS),
      ...pickBooleanPrefs(prefs, ORG_NOTIFICATION_PREF_KEYS),
    };
    await this.prisma.organization.update({
      where: { id: organizationId },
      data: { notificationPrefs: merged },
    });

    return { success: true, data: { notificationPrefs: merged } };
  }

  async updateSecuritySettings(organizationId: string, settings: unknown) {
    await this.prisma.organization.update({
      where: { id: organizationId },
      // Stored as sent (a JSON column); the settings screen owns its shape.
      data: { securitySettings: settings as Prisma.InputJsonValue },
    });

    return { success: true, data: { securitySettings: settings } };
  }
}
