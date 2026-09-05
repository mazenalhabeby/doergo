import { BadRequestException, Body, Controller, Delete, Get, HttpException, HttpStatus, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators';
import { PlatformAuthGuard, RequirePlatformPerm } from '../../common/guards/platform-auth.guard';
import { PlatformAdminService } from './platform-admin.service';
import { ADD_ON_KEYS, isAddOn, BILLING_MODES, type BillingMode } from '@hbcfield/shared';

/**
 * PLATFORM Control Center (company super-admin). `@Public()` skips the customer
 * JWT chain; the PLATFORM-STAFF Bearer token is verified by PlatformAuthGuard and
 * each route is gated on an RBAC capability. Every mutation carries the acting
 * staff member's id for audit.
 */
@Controller('platform')
@Public()
@UseGuards(PlatformAuthGuard)
@Throttle({ default: { limit: 120, ttl: 60_000 } })
export class PlatformAdminController {
  constructor(private readonly svc: PlatformAdminService) {}

  private unwrap<T>(result: any): T {
    if (result && result.success === false) {
      throw new HttpException({ message: result.message ?? 'Error' }, result.statusCode ?? HttpStatus.BAD_REQUEST);
    }
    return result;
  }
  private actor(req: any): string | undefined { return req.platformUser?.id; }

  @Get('overview')
  @RequirePlatformPerm('view')
  async overview() { return this.unwrap(await this.svc.overview()); }

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
  async mail() { return this.unwrap(await this.svc.mailStatus()); }

  @Get('orgs')
  @RequirePlatformPerm('view')
  async listOrgs(@Query('search') search?: string, @Query('status') status?: string) {
    return this.unwrap(await this.svc.listOrgs({ search, status }));
  }

  @Get('orgs/:id')
  @RequirePlatformPerm('view')
  async orgDetail(@Param('id') id: string) { return this.unwrap(await this.svc.orgDetail({ organizationId: id })); }

  @Post('orgs/:id/extend-trial')
  @RequirePlatformPerm('extendTrial')
  async extendTrial(@Param('id') id: string, @Body() body: { days?: number }, @Request() req: any) {
    return this.unwrap(await this.svc.extendTrial({ organizationId: id, days: Number(body?.days) || 14, byUserId: this.actor(req) }));
  }

  /** End a trial now — the mirror of extend, and the operator's cue to the customer. */
  @Post('orgs/:id/end-trial')
  @RequirePlatformPerm('extendTrial')
  async endTrial(@Param('id') id: string, @Request() req: any) {
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
    @Request() req: any,
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
  async clearAgreedPrice(@Param('id') id: string, @Request() req: any) {
    return this.unwrap(await this.svc.clearAgreedPrice({ organizationId: id, byUserId: this.actor(req) }));
  }

  @Post('orgs/:id/suspend')
  @RequirePlatformPerm('manageOrgs')
  async suspend(@Param('id') id: string, @Request() req: any) { return this.unwrap(await this.svc.suspend({ organizationId: id, byUserId: this.actor(req) })); }

  @Post('orgs/:id/reactivate')
  @RequirePlatformPerm('manageOrgs')
  async reactivate(@Param('id') id: string, @Request() req: any) { return this.unwrap(await this.svc.reactivate({ organizationId: id, byUserId: this.actor(req) })); }

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
  async ackBillingAlert(@Param('id') id: string, @Request() req: any) {
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
   */
  @Post('orgs/:id/billing-mode')
  @RequirePlatformPerm('manageOrgs')
  async setBillingMode(
    @Param('id') id: string,
    @Body() body: { mode?: string; invoiceDueDays?: number },
    @Request() req: any,
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
   * bought things. Omitting `addOns` grants everything, which is what setting
   * the enterprise tier used to mean.
   */
  @Post('orgs/:id/add-ons')
  @RequirePlatformPerm('manageOrgs')
  async setAddOns(@Param('id') id: string, @Body() body: { addOns?: string[] }) {
    const addOns = Array.isArray(body?.addOns) ? body.addOns : ADD_ON_KEYS;
    const unknown = addOns.filter((k) => !isAddOn(k));
    if (unknown.length) throw new HttpException({ message: `Not an add-on: ${unknown.join(', ')}` }, HttpStatus.BAD_REQUEST);
    return this.unwrap(await this.svc.setAddOns({ organizationId: id, addOns }));
  }
}
