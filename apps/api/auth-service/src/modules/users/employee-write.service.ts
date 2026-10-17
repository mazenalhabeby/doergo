import { SessionEvents } from '../../common/session-events/session-events.service';
import {
  writeRateChange,
  RateChangeError,
  PRICE_ON_WORKSPACE_MESSAGE,
  Role,
  getDefaultModules,
  normalizeEmail,
} from '@hbcfield/shared';
import { Injectable, NotFoundException, ConflictException, BadRequestException, Optional } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateEmployeeDto, UpdateEmployeeDto } from './dto';
import * as bcrypt from 'bcryptjs';
import { BCRYPT_COST_FACTOR, generateRandomPassword } from './users-common';

/** Changing a member: adding one, and editing their profile and rates. */
@Injectable()
export class EmployeeWriteService {
  constructor(
    private readonly prisma: PrismaService,
    // Optional: socket revocation is best effort, and unit tests that do not
    // exercise it need not wire it.
    @Optional() private readonly sessionEvents?: SessionEvents,
  ) {}

  /**
   * Create a new employee
   */
  async createEmployee(dto: CreateEmployeeDto) {
    const {
      email: rawEmail,
      firstName,
      lastName,
      password,

      position = 'technician',
      enabledModules,
      specialty,
      maxDailyJobs = 5,
      organizationId,
    } = dto;
    // Stored and looked up in the ONE canonical form sign-in uses, or an
    // address saved as typed ("Mike@…") can never sign in, and the same mailbox
    // could hold a second account by changing its case.
    const email = normalizeEmail(rawEmail);

    // Check if email already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('Email already in use');
    }

    // Generate password if not provided
    const actualPassword = password || generateRandomPassword();
    const passwordHash = await bcrypt.hash(actualPassword, BCRYPT_COST_FACTOR);

    // Determine default modules from position if not provided
    const providedModules = enabledModules || getDefaultModules(position);
    const moduleList = Array.isArray(providedModules)
      ? providedModules
      : ((providedModules as { modules?: string[] })?.modules ?? getDefaultModules(position));

    // Create employee
    const employee = await this.prisma.user.create({
      data: {
        email,
        firstName,
        lastName,
        passwordHash,
        role: Role.EMPLOYEE,
        position,
        // New members start LEAST-PRIVILEGE: their own assigned spaces only
        // (admins widen via the Access tab). Stored as an Access Profile.
        enabledModules: { modules: moduleList, spaceScope: 'own' },
        specialty,
        maxDailyJobs,
        organizationId,
        canCreateTasks: false,
        canViewAllTasks: false,
        canAssignTasks: false,
        canManageUsers: false,
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        role: true,
        isActive: true,
        position: true,
        enabledModules: true,
        specialty: true,
        maxDailyJobs: true,
        organizationId: true,
        createdAt: true,
      },
    });

    return {
      success: true,
      data: employee,
      // Include generated password only if we generated it
      ...(password ? {} : { generatedPassword: actualPassword }),
    };
  }

  /**
   * Update an employee
   */
  async updateEmployee(id: string, organizationId: string, dto: UpdateEmployeeDto) {
    // Verify employee exists and belongs to organization
    const existing = await this.prisma.user.findFirst({
      where: {
        id,
        organizationId,
        role: Role.EMPLOYEE,
      },
    });

    if (!existing) {
      throw new NotFoundException('Employee not found');
    }

    const employee = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.firstName !== undefined && { firstName: dto.firstName }),
        ...(dto.lastName !== undefined && { lastName: dto.lastName }),
        ...(dto.position !== undefined && { position: dto.position }),
        ...(dto.enabledModules !== undefined && { enabledModules: dto.enabledModules }),
        ...(dto.specialty !== undefined && { specialty: dto.specialty }),
        ...(dto.employmentType !== undefined && { employmentType: dto.employmentType }),
        ...(dto.maxDailyJobs !== undefined && { maxDailyJobs: dto.maxDailyJobs }),
        // Vacation entitlement. Null is meaningful — "use the organization's
        // default" — and is NOT the same as 0, which is no paid leave at all,
        // so an explicit null has to reach the database rather than be treated
        // as "field omitted".
        ...(dto.leaveAllowance !== undefined && {
          leaveAllowance: dto.leaveAllowance === null || dto.leaveAllowance === '' ? null : Number(dto.leaveAllowance),
        }),
        ...(dto.employmentStartDate !== undefined && {
          employmentStartDate: dto.employmentStartDate ? new Date(dto.employmentStartDate) : null,
        }),
        /*
          What this person bills and costs per hour.
          
          ⚠️ Undefined is "not mentioned" and leaves the column alone; null is
          "clear it, inherit from the level above"; 0 is a real rate of nothing.
          All three are distinct, and collapsing any pair breaks the ladder in
          shared — which is the only place the order of the four levels is
          written down.
        */
        // Rates are written below through the ONE dated writer, never here.
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        // Switched off here is the same act as deactivateEmployee — see below.
        ...(dto.isActive === false && { tokensValidAfter: new Date() }),
        ...(dto.rating !== undefined && { rating: dto.rating }),
        ...(dto.ratingCount !== undefined && { ratingCount: dto.ratingCount }),
        ...(dto.canCreateTasks !== undefined && { canCreateTasks: dto.canCreateTasks }),
        // ⚠️ Stored as sent (JSON column), as before — the badges are not validated on this path.
        ...(dto.profileBadges !== undefined && { profileBadges: dto.profileBadges as Prisma.InputJsonValue }),
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        role: true,
        isActive: true,
        position: true,
        enabledModules: true,
        specialty: true,
        employmentType: true,
        maxDailyJobs: true,
        rating: true,
        ratingCount: true,
        canCreateTasks: true,
        organizationId: true,
        updatedAt: true,
      },
    });
    await this.writeMemberRates(id, organizationId, dto);

    /*
      ⚠️ Deactivating through the edit form used to leave the person signed in:
      their refresh token kept minting access tokens until it expired (90 days).
      The same three effects as deactivateEmployee: cut-off, tokens gone, live
      sessions told.
    */
    if (dto.isActive === false) {
      await this.prisma.refreshToken.deleteMany({ where: { userId: id } });
      this.sessionEvents?.sessionsRevoked(id);
    }

    return { success: true, data: employee };
  }

  /**
   * A member's own hourly rates, through the shared dated writer: a history
   * row from the start day (default today), then the column set to whatever is
   * in force today. Undefined leaves a rate alone; null clears it to inherit.
   */
  private async writeMemberRates(
    userId: string,
    organizationId: string,
    dto: { billRateCents?: unknown; costRateCents?: unknown; costDayCents?: unknown; rateEffectiveFrom?: string },
  ) {
    if (dto.billRateCents === undefined && dto.costRateCents === undefined && dto.costDayCents === undefined) return;
    // A price lives on the workspace (rate-ladder LEVELS_BY_KIND); a person carries only what they cost.
    if (dto.billRateCents !== undefined) throw new BadRequestException(PRICE_ON_WORKSPACE_MESSAGE);
    try {
      await this.prisma.$transaction(async (tx) => {
        const patch: Record<string, number | null> = {};
        const write = (kind: 'BILL_HOUR' | 'COST_HOUR' | 'COST_DAY', cents: unknown) =>
          writeRateChange(tx, {
            organizationId,
            target: 'MEMBER',
            targetId: userId,
            kind,
            cents,
            effectiveFrom: dto.rateEffectiveFrom,
          });
        if (dto.billRateCents !== undefined)
          patch.billRateCents = (await write('BILL_HOUR', dto.billRateCents)).nowCents;
        if (dto.costRateCents !== undefined)
          patch.costRateCents = (await write('COST_HOUR', dto.costRateCents)).nowCents;
        // What a DAY of this person costs — history only, read through the rate book.
        if (dto.costDayCents !== undefined) await write('COST_DAY', dto.costDayCents);
        if (Object.keys(patch).length) await tx.user.update({ where: { id: userId }, data: patch });
      });
    } catch (e) {
      if (e instanceof RateChangeError) throw new BadRequestException(e.message);
      throw e;
    }
  }
}
