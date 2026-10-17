import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Request, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { DenyExternal } from '../../common/decorators';
import { moduleAnywhere, parseContactImport, CONTACT_IMPORT_MESSAGES } from '@hbcfield/shared';
import { CustomerDto, assertClientLocale } from './customers-controller-helpers';
import { CustomersControllerBase } from './customers-controller.base';

/**
 * Customers. Two overlapping uses on ONE model:
 *  - org-level customer CRUD (portal residents management — reads with
 *    canViewAllTasks, existing behaviour), and
 *  - per-space CRM: a space's Customers list (?spaceId=), gated on the space's
 *    `crm` module. "Invite to app" (B2C Portal module) reuses the portal flow.
 */
@ApiTags('customers')
@ApiBearerAuth()
/*
  Open to external members — by their CRM grant in a workspace, and nothing else.

  This class was `@DenyExternal()` because the surface was gated on
  `canViewAllTasks`, which an external supervisor holds to follow the work, so
  granting the first silently granted the second. That is no longer how it is
  decided: customers.service resolves the caller's CRM REACH (crm/crm-reach.ts)
  from the database on every call — org-wide caps, and per workspace ONLY the
  crm* keys of that workspace's role (no canViewAllTasks/canManageUsers bridge),
  only where the workspace runs the crm module — and judges each client by the
  workspace it is filed in. An external member has no org-wide caps at all, so
  they reach exactly the clients of the workspace that granted them CRM, and
  everything else answers 404.

  What stays closed to them is what belongs to the organization rather than to a
  workspace: the phone's address-book import (and its hashes), and inviting a
  client into the app (`@DenyExternal()` on those routes).

  ⚠️ No `@RequirePermission('crm…')` on a route that cannot name its workspace:
  that guard reads the ORG-wide flag and would refuse a member whose CRM grant
  is a workspace's. The service is the boundary on every route here.
*/
@Controller('customers')
export class CustomersController extends CustomersControllerBase {
  // CRM read/work endpoints are authorization-enforced IN the service against the
  // caller's CRM caps + per-record ownership (see customers.service). We pass the
  // caller and drop the flat @RequirePermission so scoped CRM members (not just
  // canViewAllTasks/canManageUsers holders) can reach their own clients.
  @Get()
  @ApiOperation({ summary: 'List customers (org-wide, or a space via ?spaceId=)' })
  async list(
    @Request() req: any,
    @Query('search') search?: string,
    @Query('status') status?: 'active' | 'inactive' | 'all',
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('portalResident') portalResident?: string,
    @Query('spaceId') spaceId?: string,
    @Query('includeUnfiled') includeUnfiled?: string,
    @Query('contacts') contacts?: 'exclude' | 'only' | 'all',
    @Query('type') type?: string,
  ) {
    return this.auth('list_customers', {
      contacts,
      type,
      organizationId: req.user.organizationId,
      search,
      status,
      spaceId,
      includeUnfiled: includeUnfiled === 'true',
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      // 'false' → B2B customers only; 'true' → residents only; omitted → all.
      portalResident: portalResident === undefined ? undefined : portalResident === 'true',
      caller: this.caller(req),
    });
  }

  /*
    What the caller owes clients today — the home Clients card. One read across
    the book; the service narrows it to the caller's CRM view and to reminders
    that are theirs. ⚠️ Declared BEFORE `:id` so "due" is not read as an id.
  */
  @Get('due')
  @ApiOperation({ summary: 'Reminders owed today, clients going cold, and the book size (home card)' })
  due(
    @Request() req: any,
    @Query('dayStart') dayStart?: string,
    @Query('dayEnd') dayEnd?: string,
    @Query('limit') limit?: string,
  ) {
    return this.auth('customers_due', {
      organizationId: req.user.organizationId,
      caller: this.caller(req),
      // ⚠️ CRM must RUN in a workspace the caller is assigned to — read off the
      // session (no lookup), the same question the phone asks before showing
      // the card. A CRM view in an organization whose workspaces all have CRM
      // switched off is a permission for a feature nobody is using.
      crmOn: moduleAnywhere(req.user, 'crm'),
      dayStart,
      dayEnd,
      limit: limit ? Number(limit) : undefined,
    });
  }

  /*
    ── Clients from the phone's address book ──────────────────────────────────

    Both gated in the SERVICE on the ability to create clients (the same gate as
    adding one by hand) and closed to external members: a phone's address book
    is the organization's channel into its book, not a workspace's.
    ⚠️ Declared BEFORE `:id` so "match-keys" / "import" are not read as ids.
  */
  @Get('match-keys')
  @DenyExternal()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary: "Hashed keys of the organization's clients — the phone marks 'already a client' without sending a contact",
  })
  matchKeys(@Request() req: any) {
    return this.auth('customer_match_keys', { organizationId: req.user.organizationId, caller: this.caller(req) });
  }

  @Post('import')
  @DenyExternal()
  // An import is up to 200 clients in one go; a member does this a few times, not a few hundred.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Import picked phone contacts as clients — one transaction, duplicates matched on the server',
  })
  async importContacts(@Body() body: unknown, @Request() req: any) {
    // Refused here without a round trip; the service parses again — it is the boundary.
    const parsed = parseContactImport(body);
    if (!parsed.ok) {
      throw new BadRequestException({
        message: CONTACT_IMPORT_MESSAGES[parsed.problem],
        code: `CONTACT_IMPORT_${parsed.problem}`,
      });
    }
    const orgId = req.user.organizationId;
    await this.requireSpaceModule(parsed.value.spaceId, orgId, 'crm');
    return this.authMutation(
      'import_customer_contacts',
      { organizationId: orgId, body: parsed.value, caller: this.caller(req) },
      orgId,
    );
  }

  /*
    ── Contact people ─────────────────────────────────────────────────────────

    Authorization is enforced in the SERVICE, like every other CRM route here:
    it resolves the caller's CRM abilities, loads both records with the
    organization filter, and applies the per-record ownership rule. The gateway's
    job is to make sure the organization comes from the token and the caller is
    who the session says they are — neither is ever read from the body.

    ⚠️ `contacts/:linkId` is declared BEFORE `:id` so a link id is not matched as
    a customer id.
  */
  @Patch('contacts/:linkId')
  @ApiOperation({ summary: 'Change a contact’s role, or make them the primary contact' })
  async updateContact(
    @Param('linkId') linkId: string,
    @Body() body: { role?: string | null; isPrimary?: boolean },
    @Request() req: any,
  ) {
    return this.auth('update_customer_contact', {
      linkId,
      role: body?.role,
      isPrimary: body?.isPrimary,
      organizationId: req.user.organizationId,
      caller: this.caller(req),
    });
  }

  @Delete('contacts/:linkId')
  @ApiOperation({ summary: 'Detach a contact person (the person record is kept)' })
  async removeContact(@Param('linkId') linkId: string, @Request() req: any) {
    return this.auth('remove_customer_contact', {
      linkId,
      organizationId: req.user.organizationId,
      caller: this.caller(req),
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a customer' })
  async get(@Param('id') id: string, @Request() req: any) {
    return this.auth('get_customer', { id, organizationId: req.user.organizationId, caller: this.caller(req) });
  }

  @Post()
  @ApiOperation({ summary: 'Create a customer (CRM record; ?spaceId scopes it to a space)' })
  async create(@Body() dto: CustomerDto, @Request() req: any) {
    assertClientLocale(dto);
    const orgId = req.user.organizationId;
    if (dto.spaceId) {
      await this.requireSpaceModule(dto.spaceId, orgId, 'crm');
      dto = { ...dto, ownerId: dto.ownerId ?? req.user.id };
    }
    return this.authMutation('create_customer', { organizationId: orgId, dto, caller: this.caller(req) }, orgId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a customer' })
  async update(@Param('id') id: string, @Body() dto: CustomerDto, @Request() req: any) {
    assertClientLocale(dto);
    // Moving a customer into a space requires that space to have the CRM module
    // (parity with create; the service also validates the space belongs to org).
    if (dto.spaceId) await this.requireSpaceModule(dto.spaceId, req.user.organizationId, 'crm');
    return this.authMutation(
      'update_customer',
      { id, organizationId: req.user.organizationId, dto, actorId: req.user.id, caller: this.caller(req) },
      req.user.organizationId,
      id,
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Deactivate a customer (soft delete; revokes any app login)' })
  async remove(@Param('id') id: string, @Request() req: any) {
    const result: any = await this.auth('delete_customer', {
      id,
      organizationId: req.user.organizationId,
      caller: this.caller(req),
    });
    // Instantly revoke the deactivated portal logins (don't wait for the 60s
    // token-cache TTL) — consistent with every other access-change path.
    const ids: string[] = result?.deactivatedUserIds ?? [];
    await Promise.all(ids.map((uid) => this.authCache.invalidateUser(uid).catch(() => undefined)));
    this.orgEvents.customerChanged(req.user.organizationId, id);
    return result;
  }
}
