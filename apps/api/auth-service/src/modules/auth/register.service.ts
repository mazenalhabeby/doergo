import { BCRYPT_COST_FACTOR, DEFAULT_PERMISSIONS, DEFAULT_ORG_MODULES, Role, normalizeEmail } from '@hbcfield/shared';
import { Injectable, HttpStatus, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { seedDefaultWorkflow } from '../../common/seed-default-workflow';
import * as bcrypt from 'bcryptjs';
import { BillingTrialService } from './../billing/billing-trial.service';
import { permissionColumns, NEW_ACCOUNT_USER_SELECT } from '../../common/records/permission-columns';

/** Opening an account: a new organization owner, or a person with no organization yet. */
@Injectable()
export class RegisterService {
  private readonly logger = new Logger(RegisterService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly trials: BillingTrialService,
  ) {}

  async register(data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    role: string;
    companyName?: string;
    firstSpaceName?: string;
  }) {
    try {
      // Sanitize inputs: email to lowercase, names preserve case (capitalized by DTO)
      const email = normalizeEmail(data.email);
      const firstName = data.firstName.trim();
      const lastName = data.lastName.trim();
      const companyName = data.companyName?.trim();
      // SECURITY: Force role to ADMIN regardless of input (self-registered users are admins of their org)
      const role = Role.ADMIN;
      // Get default permissions for the role
      const defaultPerms = DEFAULT_PERMISSIONS[role];

      const existingUser = await this.prisma.user.findUnique({
        where: { email },
      });

      if (existingUser) {
        return {
          success: false,
          statusCode: HttpStatus.CONFLICT,
          message: 'An account with this email already exists',
        };
      }

      // Use higher bcrypt cost factor (12) for better security
      const passwordHash = await bcrypt.hash(data.password, BCRYPT_COST_FACTOR);

      // Determine if this is a full registration (with org) or orphan user (onboarding later)
      const hasCompanyName = !!companyName;

      if (hasCompanyName) {
        // Full registration: create org + user in a transaction
        const result = await this.prisma.$transaction(async (tx) => {
          const organization = await tx.organization.create({
            data: {
              name: companyName,
              isActive: true,
              enabledModules: DEFAULT_ORG_MODULES,
            },
          });

          // The org's first space is created in the dedicated "Set up your first
          // space" onboarding step (so it can have a type, address & map pin) —
          // not here. The org starts with no space.

          // Seed the org's default task type (Field Service) so Task Types isn't
          // empty and new tasks have a capability-rich flow out of the box.
          await seedDefaultWorkflow(tx, organization.id);

          const newUser = await tx.user.create({
            data: {
              email,
              passwordHash,
              firstName,
              lastName,
              role,
              organizationId: organization.id,
              onboardingCompleted: true,
              failedLoginAttempts: 0,
              lockedUntil: null,

              ...permissionColumns(defaultPerms),
            },
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              role: true,
              organizationId: true,
              onboardingCompleted: true,
              // Works for a client or partner — see the same field on the
              // validateToken select. Both session payloads must carry it or
              // the badge changes meaning depending which one built the user.
              isExternal: true,
              avatarUrl: true,

              canCreateTasks: true,
              taskCreationScope: true,
              canViewAllTasks: true,
              canAssignTasks: true,
              canManageUsers: true,
              createdAt: true,
            },
          });

          return newUser;
        });

        // Start the 14-day Professional trial (sets planTier/subStatus/trialEndsAt
        // + Subscription row). Without this a full web signup lands with
        // planTier=null and every premium feature 402s. Non-fatal — a billing
        // hiccup must not block registration.
        if (result.organizationId) {
          try {
            await this.trials.startTrial(result.organizationId);
          } catch (e) {
            this.logger.warn(`startTrial failed for org ${result.organizationId}: ${(e as Error).message}`);
          }
        }

        return { success: true, data: result };
      } else {
        // Orphan user: no org, onboarding required
        const user = await this.prisma.user.create({
          data: {
            email,
            passwordHash,
            firstName,
            lastName,
            role,
            onboardingCompleted: false,
            failedLoginAttempts: 0,
            lockedUntil: null,
            ...permissionColumns(defaultPerms),
          },
          select: { ...NEW_ACCOUNT_USER_SELECT, createdAt: true },
        });

        return { success: true, data: user };
      }
    } catch (error) {
      this.logger.error('Registration error:', error);
      return {
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Failed to create account. Please try again.',
      };
    }
  }
}
