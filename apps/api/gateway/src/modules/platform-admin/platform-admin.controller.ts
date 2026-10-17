import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators';
import { PlatformAuthGuard, RequirePlatformPerm } from '../../common/guards/platform-auth.guard';
import { PlatformAdminService } from './platform-admin.service';
import { AuthTokenCache } from '../../common/cache/auth-token-cache.service';
import { IsBoolean } from 'class-validator';
import { BILLING_MODES, type BillingMode, assertServiceOk } from '@hbcfield/shared';
import { PlatformAuditInterceptor } from '../../common/interceptors/platform-audit.interceptor';
// The same body contract as the customer's own add-on purchase: an explicit,
// validated, duplicate-free list of real add-on keys — never "omitted = all".
import { SetAddOnsDto } from '../billing/dto';

import type { PlatformRequest } from '../../common/request.types';
/*
  Offline mode on or off.

  ⚠️ Declared ABOVE the controller, not below it. A class is not hoisted, and
  the decorator metadata on `setOfflineMode` names this type the moment the
  controller class is defined — below, the gateway dies on start with
  "Cannot access 'OfflineModeDto' before initialization".
*/
class OfflineModeDto {
  @IsBoolean()
  enabled!: boolean;
}

/**
 * PLATFORM Control Center (company super-admin). `@Public()` skips the customer
 * JWT chain; the PLATFORM-STAFF Bearer token is verified by PlatformAuthGuard and
 * each route is gated on an RBAC capability. Every mutation carries the acting
 * staff member's id for audit.
 */
@Controller('platform')
@Public()
@UseGuards(PlatformAuthGuard)
@UseInterceptors(PlatformAuditInterceptor)
@Throttle({ default: { limit: 120, ttl: 60_000 } })
export class PlatformAdminController {
  constructor(
    private readonly svc: PlatformAdminService,
    private readonly authCache: AuthTokenCache,
  ) {}

  private unwrap<T>(result: unknown): T {
    return assertServiceOk(result) as T;
  }
  private actor(req: PlatformRequest): string | undefined {
    return req.platformUser?.id;
  }

  @Get('overview')
  @RequirePlatformPerm('view')
  async overview() {
    return this.unwrap(await this.svc.overview());
  }

  /**
   * Is outbound email working?
   *
   * `view`, not an admin permission: anyone who can open this console should be
   * able to see that the platform cannot send mail. Nothing else in the product
   * surfaces it — the outage that prompted this ran with its only symptom being
   * a line in a container log, because every screen that sends email reported
   * success the moment the request returned.
   */
  @Get('mail')
  @RequirePlatformPerm('view')
  async mail() {
    return this.unwrap(await this.svc.mailStatus());
  }

  /** One page of organizations; `nextCursor` in the reply asks for the next. */
  @Get('orgs')
  @RequirePlatformPerm('view')
  async listOrgs(
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.unwrap(
      await this.svc.listOrgs({
        search,
        status,
        cursor: cursor || undefined,
        limit: limit ? Number(limit) : undefined,
      }),
    );
  }

  /** The viewer's ROLE travels so the service can leave member emails out for support readers. */
  @Get('orgs/:id')
  @RequirePlatformPerm('view')
  async orgDetail(@Param('id') id: string, @Request() req: PlatformRequest) {
    return this.unwrap(await this.svc.orgDetail({ organizationId: id, viewerRole: req.platformUser?.role }));
  }

  /**
   * The operator audit trail, newest first. Owners only: it names every
   * operator and every customer they acted on.
   */
  @Get('audit')
  @RequirePlatformPerm('viewPlatformAudit')
  async audit(
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
    @Query('actorId') actorId?: string,
    @Query('organizationId') organizationId?: string,
  ) {
    return this.unwrap(
      await this.svc.auditList({
        cursor: cursor || undefined,
        limit: limit ? Number(limit) : undefined,
        actorId: actorId || undefined,
        organizationId: organizationId || undefined,
      }),
    );
  }

  @Post('orgs/:id/extend-trial')
  @RequirePlatformPerm('extendTrial')
  async extendTrial(@Param('id') id: string, @Body() body: { days?: number }, @Request() req: PlatformRequest) {
    return this.unwrap(
      await this.svc.extendTrial({ organizationId: id, days: Number(body?.days) || 14, byUserId: this.actor(req) }),
    );
  }

  /** End a trial now — the mirror of extend, and the operator's cue to the customer. */
  @Post('orgs/:id/end-trial')
  @RequirePlatformPerm('extendTrial')
  async endTrial(@Param('id') id: string, @Request() req: PlatformRequest) {
    return this.unwrap(await this.svc.endTrial({ organizationId: id, byUserId: this.actor(req) }));
  }

  /**
   * Agree a fixed monthly price with this organization.
   *
   * `billingOps`, not `manageOrgs` — this decides what a customer is charged,
   * and the role that may switch an account off is not automatically the role
   * that may discount one.
   *
   * The organization is the PATH parameter and the operator comes from the
   * verified platform session; neither is read from the body, so a crafted
   * request cannot price somebody else's organization or attribute the change
   * to another operator.
   */
  @Post('orgs/:id/agreed-price')
  @RequirePlatformPerm('billingOps')
  async setAgreedPrice(
    @Param('id') id: string,
    @Body() body: { monthlyCents?: number; until?: string | null; note?: string | null },
    @Request() req: PlatformRequest,
  ) {
    return this.unwrap(
      await this.svc.setAgreedPrice({
        organizationId: id,
        monthlyCents: Number(body?.monthlyCents),
        until: body?.until ?? null,
        note: body?.note ?? null,
        byUserId: this.actor(req),
      }),
    );
  }

  /** Put them back on the price list. Can multiply what they pay — confirmed on the console. */
  @Delete('orgs/:id/agreed-price')
  @RequirePlatformPerm('billingOps')
  async clearAgreedPrice(@Param('id') id: string, @Request() req: PlatformRequest) {
    return this.unwrap(await this.svc.clearAgreedPrice({ organizationId: id, byUserId: this.actor(req) }));
  }

  @Post('orgs/:id/suspend')
  @RequirePlatformPerm('manageOrgs')
  async suspend(@Param('id') id: string, @Request() req: PlatformRequest) {
    return this.unwrap(await this.svc.suspend({ organizationId: id, byUserId: this.actor(req) }));
  }

  /** The offline-first mobile app, on or off for one organization — the staged rollout. */
  @Post('orgs/:id/offline-mode')
  @RequirePlatformPerm('manageOrgs')
  async setOfflineMode(@Param('id') id: string, @Body() body: OfflineModeDto, @Request() req: PlatformRequest) {
    const result = this.unwrap(
      await this.svc.setOfflineMode({ organizationId: id, enabled: body.enabled, byUserId: this.actor(req) }),
    );
    // The gateway caches sessions per organization; drop them so the change is read now.
    await this.authCache.invalidateOrganization(id).catch(() => undefined);
    return result;
  }

  @Post('orgs/:id/reactivate')
  @RequirePlatformPerm('manageOrgs')
  async reactivate(@Param('id') id: string, @Request() req: PlatformRequest) {
    return this.unwrap(await this.svc.reactivate({ organizationId: id, byUserId: this.actor(req) }));
  }

  /**
   * Bills that fell materially. The one thing on this console that nobody
   * thinks to go and look for, so it also drives a count in the header.
   */
  @Get('billing-alerts')
  @RequirePlatformPerm('manageOrgs')
  async billingAlerts(@Query('all') all?: string) {
    return this.unwrap(await this.svc.billingAlerts({ includeAcknowledged: all === '1' || all === 'true' }));
  }

  @Post('billing-alerts/:id/ack')
  @RequirePlatformPerm('manageOrgs')
  async ackBillingAlert(@Param('id') id: string, @Request() req: PlatformRequest) {
    return this.unwrap(await this.svc.ackBillingAlert({ id, byUserId: this.actor(req) }));
  }

  /**
   * How this organization pays: card, invoice, or by agreement.
   *
   * The most consequential control on this console. Moving an organization TO
   * automatic starts charging a real customer's card; moving one away stops
   * revenue arriving. So it takes an explicit mode rather than a toggle, the
   * service refuses a mode the organization cannot support, and every change is
   * written to the audit log with who did it.
   *
   * `billingOps`, like the agreed price: how a customer is charged is a billing
   * decision, not an account-management one.
   */
  @Post('orgs/:id/billing-mode')
  @RequirePlatformPerm('billingOps')
  async setBillingMode(
    @Param('id') id: string,
    @Body() body: { mode?: string; invoiceDueDays?: number },
    @Request() req: PlatformRequest,
  ) {
    const mode = String(body?.mode ?? '').toUpperCase();
    // Validated here as well as in the service: an unknown mode must never
    // reach a Stripe call, and the enum is the whole safety of this endpoint.
    if (!BILLING_MODES.includes(mode as BillingMode)) {
      throw new BadRequestException(`mode must be one of ${BILLING_MODES.join(', ')}`);
    }
    return this.unwrap(
      await this.svc.setBillingMode({
        organizationId: id,
        mode: mode as BillingMode,
        invoiceDueDays: Number(body?.invoiceDueDays) || undefined,
        byUserId: this.actor(req),
      }),
    );
  }

  /**
   * Grant an organization its capabilities. Replaces setting a tier — a
   * negotiated contract grants what it covers, and the gate only understands
   * bought things.
   *
   * `billingOps`: this changes what the organization is entitled to and billed
   * for. The list is EXPLICIT and validated (SetAddOnsDto): omitting it used to
   * grant every add-on, so a malformed request handed out the whole catalogue.
   * The operator is recorded, and the organization's cached sessions are
   * dropped so the change is read on their next request, not a minute later.
   */
  @Post('orgs/:id/add-ons')
  @RequirePlatformPerm('billingOps')
  async setAddOns(@Param('id') id: string, @Body() body: SetAddOnsDto, @Request() req: PlatformRequest) {
    const result = this.unwrap(
      await this.svc.setAddOns({ organizationId: id, addOns: body.addOns, byUserId: this.actor(req) }),
    );
    await this.authCache.invalidateOrganization(id).catch(() => undefined);
    return result;
  }
}
