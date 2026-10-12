import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Inject,
  Request,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { OrgEventsService } from '../../common/events/org-events.service';
import { ClientProxy } from '@nestjs/microservices';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { firstValueFrom } from 'rxjs';
import { Throttle } from '@nestjs/throttler';
import { DenyExternal } from '../../common/decorators';
import { AuthTokenCache } from '../../common/cache/auth-token-cache.service';
import { parseClientLocale, CLIENT_LOCALE_INVALID_MESSAGE, parseCurrency, CURRENCY_INVALID_MESSAGE, moduleAnywhere, parseContactImport, CONTACT_IMPORT_MESSAGES, pickUnitFields } from '@hbcfield/shared';
import { SpaceModulesService } from '../../common/space-modules.service';

interface CustomerDto {
  /** Made on the phone when creating: a client added twice is one client. Ignored on update. */
  id?: string;
  name?: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
  isActive?: boolean;
  spaceId?: string | null; // per-space CRM
  ownerId?: string | null; // sales owner
  managerIds?: string[] | null; // assigned sales managers
  status?: string; // CRM lifecycle stage
  // Person vs Company + B2B company fields
  type?: string; // PERSON | COMPANY
  legalName?: string | null;
  website?: string | null;
  industry?: string | null;
  vatId?: string | null;
  regNumber?: string | null;
  /** The language email to this client is written in. null / "" = not set. */
  locale?: string | null;
  /** Invoice currency outside a workspace. null / "" = the organization's. */
  currency?: string | null;
  /** The company that invoices this client outside a workspace. null / "" = the main one. */
  legalEntityId?: string | null;
  details?: { label: string; value: string }[] | null;
}

/**
 * Refuse a language that is not on the list before anything is forwarded.
 *
 * auth-service refuses it too — it is the boundary, and the phone's offline
 * sync reaches it by another route — but a request that can only fail should
 * fail here, without a round trip and without a module check on the way.
 */
function assertClientLocale(dto: CustomerDto): void {
  if (dto.locale !== undefined && !parseClientLocale(dto.locale).ok) {
    throw new BadRequestException(CLIENT_LOCALE_INVALID_MESSAGE);
  }
  if (dto.currency !== undefined && !parseCurrency(dto.currency, { optional: true }).ok) {
    throw new BadRequestException(CURRENCY_INVALID_MESSAGE);
  }
}

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
export class CustomersController {
  constructor(
    @Inject('AUTH_SERVICE') private readonly authClient: ClientProxy,
    private readonly spaceModules: SpaceModulesService,
    private readonly authCache: AuthTokenCache,
    private readonly orgEvents: OrgEventsService,
  ) {}

  private auth(cmd: string, payload: any) {
    return firstValueFrom(this.authClient.send({ cmd }, payload));
  }

  /**
   * Run a CRM mutation and tell the org to re-read (audit C-D2). Nothing in the
   * CRM announced anything: a rep adding an activity was invisible to a
   * co-manager viewing the same client, and a new client never appeared on another
   * admin's list. Broadcast on success only — a refused mutation changed nothing.
   */
  private async authMutation(cmd: string, payload: any, organizationId: string, customerId?: string) {
    const res = await this.auth(cmd, payload);
    if (!res || res.success !== false) {
      this.orgEvents.customerChanged(organizationId, customerId ?? res?.data?.id ?? res?.id);
    }
    return res;
  }

  /** Caller context for CRM cap resolution + per-record ownership (server-authoritative). */
  private caller(req: any) {
    return { userId: req.user.id, role: req.user.role };
  }

  /** Assert the space has a module enabled (per-space gate; defence in depth). */
  private async requireSpaceModule(spaceId: string | null | undefined, organizationId: string, mod: string) {
    if (!spaceId) throw new BadRequestException('spaceId is required');
    await this.spaceModules.assertEnabled(spaceId, organizationId, mod);
  }


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
  @ApiOperation({ summary: "Hashed keys of the organization's clients — the phone marks 'already a client' without sending a contact" })
  matchKeys(@Request() req: any) {
    return this.auth('customer_match_keys', { organizationId: req.user.organizationId, caller: this.caller(req) });
  }

  @Post('import')
  @DenyExternal()
  // An import is up to 200 clients in one go; a member does this a few times, not a few hundred.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Import picked phone contacts as clients — one transaction, duplicates matched on the server' })
  async importContacts(@Body() body: unknown, @Request() req: any) {
    // Refused here without a round trip; the service parses again — it is the boundary.
    const parsed = parseContactImport(body);
    if (!parsed.ok) {
      throw new BadRequestException({ message: CONTACT_IMPORT_MESSAGES[parsed.problem], code: `CONTACT_IMPORT_${parsed.problem}` });
    }
    const orgId = req.user.organizationId;
    await this.requireSpaceModule(parsed.value.spaceId, orgId, 'crm');
    return this.authMutation('import_customer_contacts', { organizationId: orgId, body: parsed.value, caller: this.caller(req) }, orgId);
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

  @Get(':id/contacts')
  @ApiOperation({ summary: 'Who works at this company' })
  async listContacts(@Param('id') id: string, @Request() req: any) {
    return this.auth('list_customer_contacts', {
      companyId: id,
      organizationId: req.user.organizationId,
      caller: this.caller(req),
    });
  }

  @Get(':id/companies')
  @ApiOperation({ summary: 'Which companies this person is a contact at' })
  async listContactCompanies(@Param('id') id: string, @Request() req: any) {
    return this.auth('list_customer_contact_companies', {
      personId: id,
      organizationId: req.user.organizationId,
      caller: this.caller(req),
    });
  }

  @Post(':id/contacts')
  @ApiOperation({ summary: 'Attach a person to this company — an existing one, or a new one' })
  async addContact(
    @Param('id') id: string,
    @Body() body: { personId?: string; person?: { name?: string; email?: string; phone?: string }; role?: string; isPrimary?: boolean },
    @Request() req: any,
  ) {
    return this.auth('add_customer_contact', {
      companyId: id,
      personId: body?.personId,
      person: body?.person,
      role: body?.role,
      isPrimary: body?.isPrimary,
      organizationId: req.user.organizationId,
      caller: this.caller(req),
    });
  }

  @Post(':id/promote')
  @ApiOperation({ summary: 'Make a contact person a client in their own right' })
  async promoteContact(@Param('id') id: string, @Request() req: any) {
    return this.auth('promote_customer_contact', {
      personId: id,
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
    return this.authMutation('update_customer', { id, organizationId: req.user.organizationId, dto, actorId: req.user.id, caller: this.caller(req) }, req.user.organizationId, id);
  }

  // ── Addresses (a customer's units; one is primary → shown on the map) ──
  // Read gated by CRM reach (get_customer enforces it); writes stay manager-only
  // in Phase 1 (address editing for scoped members is a follow-up).
  @Get(':id/addresses')
  async listAddresses(@Param('id') id: string, @Request() req: any) {
    // Enforce the caller may reach this client before exposing its units.
    await this.auth('get_customer', { id, organizationId: req.user.organizationId, caller: this.caller(req) });
    return this.auth('portal_list_units', { organizationId: req.user.organizationId, customerId: id });
  }

  /*
    Address WRITES carry the caller as `crmCaller`: the portal service then asks
    the CRM's own reach rule (view-all, or own / co-manage this client, plus
    editInfo) before touching a unit. `crmEditInfo` alone let a rep scoped to
    their own clients edit any client's addresses by id. No route-level
    `crmEditInfo` any more: it read the ORG-wide flag and refused a member whose
    edit right is a workspace's — the service decides on the client's own
    workspace (org ∪ that workspace's grant). Identity goes LAST and
    the body is whitelisted (`pickUnitFields`, no relations): an address edits
    its own text and pin, never which client, space or portal it belongs to.
  */
  @Post(':id/addresses')
  addAddress(@Param('id') id: string, @Body() body: { name?: string; address?: string; lat?: number; lng?: number; isPrimary?: boolean; contactName?: string; contactPhone?: string }, @Request() req: any) {
    const fields = pickUnitFields(body, { relations: false });
    return this.auth('portal_create_unit', {
      ...fields,
      name: body?.name?.trim() || body?.address || 'Address',
      organizationId: req.user.organizationId, customerId: id, crmCaller: this.caller(req),
    });
  }

  @Patch(':id/addresses/:unitId')
  updateAddress(@Param('id') id: string, @Param('unitId') unitId: string, @Body() body: any, @Request() req: any) {
    // scopeCustomerId binds the unit to THIS customer (no cross-customer edits).
    return this.auth('portal_update_unit', {
      ...pickUnitFields(body, { relations: false }),
      id: unitId, organizationId: req.user.organizationId, scopeCustomerId: id,
      actorId: req.user.id, crmCaller: this.caller(req),
    });
  }

  @Post(':id/addresses/:unitId/primary')
  setPrimaryAddress(@Param('id') id: string, @Param('unitId') unitId: string, @Request() req: any) {
    return this.auth('portal_set_primary_unit', { id: unitId, organizationId: req.user.organizationId, customerId: id, crmCaller: this.caller(req) });
  }

  @Delete(':id/addresses/:unitId')
  deleteAddress(@Param('id') id: string, @Param('unitId') unitId: string, @Request() req: any) {
    return this.auth('portal_delete_unit', { id: unitId, organizationId: req.user.organizationId, customerId: id, crmCaller: this.caller(req) });
  }

  // ── CRM activity timeline (service enforces reach + work cap) ──
  @Get(':id/activities')
  @ApiOperation({ summary: "A customer's CRM timeline (notes, calls, reminders, status)" })
  listActivities(@Param('id') id: string, @Request() req: any) {
    return this.auth('list_customer_activities', { customerId: id, organizationId: req.user.organizationId, caller: this.caller(req) });
  }

  @Post(':id/activities')
  @ApiOperation({ summary: 'Log an activity / note / reminder on a customer' })
  addActivity(@Param('id') id: string, @Body() body: { id?: string; type?: string; body?: string; dueAt?: string; reminderKind?: string; remindBeforeMin?: number; reminderAssigneeId?: string | null; repeat?: string }, @Request() req: any) {
    return this.authMutation('add_customer_activity', {
      clientId: body.id,
      customerId: id, organizationId: req.user.organizationId, authorId: req.user.id,
      type: body.type, body: body.body, dueAt: body.dueAt,
      reminderKind: body.reminderKind, remindBeforeMin: body.remindBeforeMin,
      reminderAssigneeId: body.reminderAssigneeId, repeat: body.repeat,
      caller: this.caller(req),
    }, req.user.organizationId, id);
  }

  @Patch(':id/activities/:activityId')
  updateActivity(@Param('id') id: string, @Param('activityId') activityId: string, @Body() body: { body?: string; dueAt?: string | null; done?: boolean; reminderKind?: string; remindBeforeMin?: number; reminderAssigneeId?: string | null; repeat?: string }, @Request() req: any) {
    return this.authMutation('update_customer_activity', {
      id: activityId, customerId: id, organizationId: req.user.organizationId,
      body: body.body, dueAt: body.dueAt, done: body.done,
      reminderKind: body.reminderKind, remindBeforeMin: body.remindBeforeMin,
      reminderAssigneeId: body.reminderAssigneeId, repeat: body.repeat,
      caller: this.caller(req),
    }, req.user.organizationId, id);
  }

  @Delete(':id/activities/:activityId')
  deleteActivity(@Param('id') id: string, @Param('activityId') activityId: string, @Request() req: any) {
    return this.authMutation('delete_customer_activity', { id: activityId, customerId: id, organizationId: req.user.organizationId, caller: this.caller(req) }, req.user.organizationId, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Deactivate a customer (soft delete; revokes any app login)' })
  async remove(@Param('id') id: string, @Request() req: any) {
    const result: any = await this.auth('delete_customer', { id, organizationId: req.user.organizationId, caller: this.caller(req) });
    // Instantly revoke the deactivated portal logins (don't wait for the 60s
    // token-cache TTL) — consistent with every other access-change path.
    const ids: string[] = result?.deactivatedUserIds ?? [];
    await Promise.all(ids.map((uid) => this.authCache.invalidateUser(uid).catch(() => undefined)));
    this.orgEvents.customerChanged(req.user.organizationId, id);
    return result;
  }

  @Post(':id/invite')
  // Bringing a client into the app is the organization's act, not a workspace's.
  @DenyExternal()
  @ApiOperation({ summary: 'Invite this customer to the app (B2C Portal) — returns a code' })
  async invite(@Param('id') id: string, @Body() body: { email?: string; portalId?: string }, @Request() req: any) {
    const orgId = req.user.organizationId;
    /*
      Both reads and the write below carry the CALLER, like every other CRM
      route: customers.service decides with the caller's CRM caps and their
      ownership of THIS record. Without it the invite was judged as nobody in
      particular, so the route-level permission was the only check on whose
      client could be flipped into a portal resident.
    */
    const caller = this.caller(req);
    const customer = await this.managedCustomer(id, orgId, caller);
    if (!customer.spaceId) throw new BadRequestException('Customer is not attached to a space');
    await this.requireSpaceModule(customer.spaceId, orgId, 'b2c_portal');

    const email = body.email?.trim() || customer.email;
    if (!email) throw new BadRequestException('An email is required to invite this customer');

    // Which portal (= which entity + which categories the client will see)?
    // Priority: (1) the customer's assigned unit's OWN portal — the apartment
    // they hold decides their portal; (2) an explicitly-chosen portalId from the
    // caller (validated to belong to this customer's space); (3) the space's
    // default portal (single-portal spaces / no choice needed).
    const units: any[] = (await this.auth('portal_list_units', { organizationId: orgId, customerId: id })) || [];
    let unit: any = units.find((u) => u.isPrimary) ?? units[0];
    let portalId: string | undefined = unit?.portalId ?? undefined;
    if (!portalId && body.portalId) {
      const p: any = await this.auth('portal_get', { id: body.portalId, organizationId: orgId });
      const portal = p?.data ?? p;
      if (!portal || portal.spaceId !== customer.spaceId) {
        throw new BadRequestException('Invalid portal for this customer');
      }
      portalId = body.portalId;
    }
    if (!portalId) {
      const portalRes: any = await this.auth('portal_ensure_for_space', { organizationId: orgId, spaceId: customer.spaceId });
      portalId = portalRes?.data?.id ?? portalRes?.id;
    }
    if (!unit) {
      unit = await this.auth('portal_create_unit', { organizationId: orgId, customerId: id, portalId, name: customer.name, address: customer.address });
    }
    const inviteRes: any = await this.auth('create_invitation', {
      targetRole: 'CUSTOMER', organizationId: orgId, createdById: req.user.id, creatorRole: req.user.role,
      customerId: id, unitId: unit.id, portalId, email,
    });
    // Flip the CRM record into a portal resident + advance the stage to Customer
    // (an invited app user has converted). Status change is auto-logged.
    await this.auth('update_customer', { id, organizationId: orgId, actorId: req.user.id, caller, dto: { isPortalResident: true, portalId, status: 'CUSTOMER' } });
    return { data: { code: inviteRes?.data?.code, email } };
  }

  @Post(':id/resend-invite')
  @DenyExternal()
  @ApiOperation({ summary: "Re-send a customer's app invite" })
  async resendInvite(@Param('id') id: string, @Request() req: any) {
    // The same door as the invite: manage where the client is filed. It used to
    // re-send for any client id on the org-wide flag alone.
    await this.managedCustomer(id, req.user.organizationId, this.caller(req));
    return this.auth('resend_invitation', { organizationId: req.user.organizationId, customerId: id });
  }

  /**
   * The client, read AS the caller (404 when out of their reach), and refused
   * unless they may manage it where it is filed — `crmCaps` on the record is
   * customers.service's answer for org ∪ that workspace, never the org flag.
   */
  private async managedCustomer(id: string, organizationId: string, caller: { userId: string; role: string }) {
    const res: any = await this.auth('get_customer', { id, organizationId, caller });
    const customer = res?.data ?? res;
    if (!customer?.id) throw new BadRequestException('Customer not found');
    if (!customer.crmCaps?.manage) throw new ForbiddenException('Not allowed to manage this client');
    return customer;
  }
}
