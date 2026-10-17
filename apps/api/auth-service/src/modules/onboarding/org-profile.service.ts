import { writeRateChange, RateChangeError, parseCurrency, CURRENCY_INVALID_MESSAGE } from '@hbcfield/shared';
import { Injectable, Logger, HttpStatus, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import { SERVICE_NAMES, industryUsesExternalWorkers } from '@hbcfield/shared';
import { leavePolicyOf } from './onboarding-helpers';

/** The organization's profile: name, address, logo, contact details. */
@Injectable()
export class OrgProfileService {
  private readonly logger = new Logger(OrgProfileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    @Inject(SERVICE_NAMES.NOTIFICATION) private readonly notificationClient: ClientProxy,
  ) {}

  async getOrgProfile(organizationId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        name: true,
        industry: true,
        usesExternalWorkers: true,
        // Crew rules: only a job's leader moves its step (shared tasks/crew.ts).
        crewMode: true,
        // What the organization pays in (shared billing/currency.ts).
        currency: true,
        // Shown on the Settings screen, so an admin can see and change the
        // number every member's vacation balance is measured against.
        defaultLeaveAllowance: true,
        // The leave ledger's policy (Settings → Leave): leave year, carry-over, tracking start.
        leaveYearMode: true,
        carryOverMode: true,
        carryOverMaxDays: true,
        carryExpiresAfterMonths: true,
        leaveTrackingStartedOn: true,
        address: true,
        addressLine1: true,
        addressLine2: true,
        city: true,
        state: true,
        postalCode: true,
        country: true,
        phone: true,
        email: true,
        website: true,
        timezone: true,
        logoUrl: true,
        vatId: true,
        billableRateCents: true,
        costRateCents: true,
        joinPolicy: true,
        profileBadges: true,
        notificationPrefs: true,
        securitySettings: true,
        enabledModules: true,
        createdAt: true,
        _count: { select: { users: true } },
      },
    });

    if (!org) {
      return { success: false, statusCode: HttpStatus.NOT_FOUND, message: 'Organization not found' };
    }

    return { success: true, data: { ...org, ...leavePolicyOf(org), memberCount: org._count.users } };
  }

  async updateOrgProfile(organizationId: string, updates: any) {
    // `usesExternalWorkers` (the in-house/external field-worker capability) is
    // settable directly by the Settings toggle.
    const allowedFields = [
      'name',
      'industry',
      'usesExternalWorkers',
      'crewMode',
      'address',
      'addressLine1',
      'addressLine2',
      'city',
      'state',
      'postalCode',
      'country',
      'phone',
      'email',
      'website',
      'timezone',
      'logoUrl',
      'vatId',
      'billableRateCents',
      'costRateCents',
      'enabledModules',
      'currency',
    ];
    const data: any = {};

    for (const key of allowedFields) {
      if (updates[key] !== undefined) {
        data[key] = updates[key];
      }
    }

    // Billable rate: coerce to a non-negative integer (EUR cents) or null to clear.
    /*
      ⚠️ BLANK CLEARS, ZERO IS A RATE — and `n > 0 ? round : null` conflated
      them, so an organisation deliberately billing nothing was unexpressible.

      The ladder in shared draws that line all the way down: null means
      "inherit", 0 means "€0 an hour". Two rules about the same column is how
      one of them quietly stops being true, so both ends use `cleanRateCents`.
    */
    /*
      ⚠️ Rates are taken OUT of the plain update and written through the shared
      dated writer below: a history row from the start day, then the column set
      to whatever is in force today. Writing the column alone re-priced every
      un-invoiced day before the change.
    */
    const rates = { billableRateCents: data.billableRateCents, costRateCents: data.costRateCents };
    delete data.billableRateCents;
    delete data.costRateCents;
    const ratesChanged = rates.billableRateCents !== undefined || rates.costRateCents !== undefined;

    if (Object.keys(data).length === 0 && !ratesChanged) {
      return { success: false, statusCode: HttpStatus.BAD_REQUEST, message: 'No valid fields to update' };
    }

    if (typeof data.crewMode !== 'undefined') data.crewMode = data.crewMode === true;
    if (data.currency !== undefined) {
      // The organization's own currency can never be empty — it is what every
      // workspace and client without one falls back to.
      const parsed = parseCurrency(data.currency);
      if (!parsed.ok) return { success: false, statusCode: HttpStatus.BAD_REQUEST, message: CURRENCY_INVALID_MESSAGE };
      data.currency = parsed.currency;
    }
    if (typeof data.usesExternalWorkers !== 'undefined') {
      data.usesExternalWorkers = !!data.usesExternalWorkers;
    } else if (typeof data.industry === 'string') {
      // Industry set (e.g. during setup) without an explicit toggle → pre-default
      // the capability from the industry (trades on, IT/office off). An explicit
      // toggle in the payload always wins (handled above).
      data.usesExternalWorkers = industryUsesExternalWorkers(data.industry);
    }

    try {
      const org = await this.prisma.$transaction(async (tx) => {
        const rateCols: Record<string, number | null> = {};
        const write = (kind: 'BILL_HOUR' | 'COST_HOUR', cents: unknown) =>
          writeRateChange(tx as any, {
            organizationId,
            target: 'ORGANIZATION',
            targetId: organizationId,
            kind,
            cents,
            effectiveFrom: updates?.rateEffectiveFrom,
          });
        if (rates.billableRateCents !== undefined)
          rateCols.billableRateCents = (await write('BILL_HOUR', rates.billableRateCents)).nowCents;
        if (rates.costRateCents !== undefined)
          rateCols.costRateCents = (await write('COST_HOUR', rates.costRateCents)).nowCents;
        return tx.organization.update({
          where: { id: organizationId },
          data: { ...data, ...rateCols },
          select: {
            id: true,
            name: true,
            industry: true,
            usesExternalWorkers: true,
            crewMode: true,
            address: true,
            addressLine1: true,
            addressLine2: true,
            city: true,
            state: true,
            postalCode: true,
            country: true,
            phone: true,
            email: true,
            website: true,
            timezone: true,
            logoUrl: true,
            vatId: true,
            billableRateCents: true,
            costRateCents: true,
            enabledModules: true,
            currency: true,
          },
        });
      });
      return { success: true, data: org };
    } catch (e) {
      if (e instanceof RateChangeError)
        return { success: false, statusCode: HttpStatus.BAD_REQUEST, message: e.message };
      throw e;
    }
  }
}
