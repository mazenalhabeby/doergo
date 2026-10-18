
import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { crmCapsIn } from '@hbcfield/shared';
import { findPrior } from '@hbcfield/shared';
import {
  CLIENT_ID,
  notFound,
  CrmCaller,
  CustomerInput,
  customerSelect,
  sanitizeDetails,
  clientLocaleFrom,
  clientCurrencyFrom,
  capText,
  sanitizeIds,
  withContactKeys,
} from './customers-helpers';
import { CustomersServiceBase } from './customers-service.base';
import { jsonColumn, optionalJsonColumn } from '../../common/records/json-column';

/** Creating a client and changing one. */
@Injectable()
export class CustomerWriteService extends CustomersServiceBase {
  async create(organizationId: string, dto: CustomerInput, caller?: CrmCaller) {
    /*
      Adding a client is its own permission now.

      It used to be manage-level, which meant the person most likely to be
      holding a business card — a sales rep — could not enter it. Deleting and
      reassigning are still manage: those act on somebody else's work, and
      adding does not.
    */
    const reach = await this.crmReachFor(caller, organizationId);
    this.assertMayCreateIn(reach, dto.spaceId ?? null);

    // A client added from the phone and sent twice is one client. The id is the
    // phone's (UUIDv7); anything else in that field is ignored, never stored.
    const clientId = typeof dto.id === 'string' && CLIENT_ID.test(dto.id) ? dto.id : undefined;
    const prior = await findPrior({
      id: clientId,
      find: (id) =>
        this.prisma.customer.findUnique({ where: { id }, select: { ...customerSelect, organizationId: true } }),
      isSame: (c) => c.organizationId === organizationId,
    });
    // The replay answers only to somebody who can reach it — an id is not a key.
    if (prior) {
      if (!this.canReach(reach, prior, caller)) throw notFound();
      return { data: prior };
    }

    const name = (dto.name || '').trim();
    if (!name) throw new BadRequestException('Customer name is required');
    const locale = clientLocaleFrom(dto.locale) ?? null;
    const currency = clientCurrencyFrom(dto.currency) ?? null;
    const legalEntityId = (await this.clientCompany(organizationId, dto.legalEntityId)) ?? null;
    await this.assertRefsInOrg(dto, organizationId);
    // ownerId must be a real member of this org (else drop it).
    const ownerId = dto.ownerId ? ((await this.keepOrgUserIds([dto.ownerId], organizationId))[0] ?? null) : null;
    // Assigned managers must be real members of THIS org (default: the creator).
    const managerIds = await this.keepOrgUserIds(
      sanitizeIds(dto.managerIds) ?? (ownerId ? [ownerId] : []),
      organizationId,
    );
    const customer = await this.prisma.customer.create({
      data: withContactKeys({
        ...(clientId ? { id: clientId } : {}),
        organizationId,
        name,
        contactName: dto.contactName ?? null,
        email: dto.email ?? null,
        phone: dto.phone ?? null,
        address: dto.address ?? null,
        notes: capText(dto.notes),
        isPortalResident: dto.isPortalResident ?? false,
        portalId: dto.portalId ?? null,
        spaceId: dto.spaceId ?? null,
        ownerId,
        // Default: the creating owner is the first assigned manager (org-validated).
        managerIds,
        type: dto.type === 'COMPANY' ? 'COMPANY' : 'PERSON',
        legalName: dto.legalName ?? null,
        website: dto.website ?? null,
        industry: dto.industry ?? null,
        vatId: dto.vatId ?? null,
        regNumber: dto.regNumber ?? null,
        locale,
        currency,
        legalEntityId,
        details: optionalJsonColumn(sanitizeDetails(dto.details)),
      }),
      select: customerSelect,
    });
    return { data: customer };
  }

  async update(id: string, organizationId: string, dto: CustomerInput, actorId?: string, caller?: CrmCaller) {
    // `spaceId` is read so a move can be told from a no-op — see the guard below.
    const existing = await this.prisma.customer.findFirst({
      where: { id, organizationId },
      select: { id: true, status: true, isPortalResident: true, ownerId: true, managerIds: true, spaceId: true },
    });
    if (!existing) throw new NotFoundException('Customer not found');

    // ── CRM access enforcement (server-authoritative), by what's being changed ──
    // Decided by the workspace the client is filed in NOW (read above, never the body's).
    const reach = await this.crmReachFor(caller, organizationId);
    const touchesPortal = dto.isPortalResident !== undefined || dto.portalId !== undefined;
    const touchesOwnership = dto.ownerId !== undefined || dto.managerIds !== undefined;
    const touchesStatus = dto.status !== undefined;
    const infoKeys = [
      'name',
      'contactName',
      'email',
      'phone',
      'address',
      'notes',
      'isActive',
      'spaceId',
      'type',
      'details',
      'legalName',
      'website',
      'industry',
      'vatId',
      'regNumber',
      'locale',
      'currency',
      'legalEntityId',
    ] as const;
    const touchesInfo = infoKeys.some((k) => dto[k] !== undefined);
    if (existing.isPortalResident || touchesPortal || touchesOwnership) {
      // Portal/app-access + ownership reassignment are manage-level.
      this.assertManage(reach, existing, caller);
    } else {
      const caps = this.capsOn(reach, existing, caller);
      if (touchesStatus && !(caps.work || caps.manage)) throw new ForbiddenException('Not allowed to change stage');
      if (touchesInfo && !(caps.editInfo || caps.manage))
        throw new ForbiddenException('Not allowed to edit client info');
    }
    /*
      Moving it to another workspace (or filing it nowhere) is editing it on
      BOTH sides: the check above covered where it is, this covers where it
      goes. Otherwise a member who edits clients in one workspace could hand a
      client to a workspace they hold nothing in — or, filed nowhere, out of
      their own reach and into everybody's with an org-wide grant.
    */
    if (dto.spaceId !== undefined && (dto.spaceId || null) !== (existing.spaceId ?? null)) {
      const there = crmCapsIn(reach, dto.spaceId || null);
      if (!(there.editInfo || there.manage)) {
        throw new ForbiddenException({
          message: 'Not allowed to move this client to that workspace.',
          code: 'CRM_WORKSPACE_NOT_ALLOWED',
        });
      }
    }

    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) throw new BadRequestException('Customer name is required');
      data.name = name;
    }
    /*
      Moving a client between workspaces.

      The workspace id itself is checked by `assertRefsInOrg`, which already
      validates every ref on every write — this only adds the rule that is about
      the MOVE rather than about the id: an app user's workspace is decided by
      the portal that runs their login, and moving them would leave that binding
      pointing into a space they are no longer in.
    */
    if (dto.spaceId !== undefined && dto.spaceId !== existing.spaceId && existing.isPortalResident) {
      throw new BadRequestException('An app user belongs to the workspace that runs their portal.');
    }

    for (const k of [
      'contactName',
      'email',
      'phone',
      'address',
      'notes',
      'isActive',
      'spaceId',
      'ownerId',
      'isPortalResident',
      'portalId',
      'status',
      'legalName',
      'website',
      'industry',
      'vatId',
      'regNumber',
    ] as const) {
      if (dto[k] !== undefined) data[k] = dto[k];
    }
    if (dto.notes !== undefined) data.notes = capText(dto.notes);
    // Info, like the phone number: gated on editInfo above, no permission of its own.
    const locale = clientLocaleFrom(dto.locale);
    if (locale !== undefined) data.locale = locale;
    const currency = clientCurrencyFrom(dto.currency);
    if (currency !== undefined) data.currency = currency;
    // Who invoices this client — info, under the same editInfo gate as the currency.
    const company = await this.clientCompany(organizationId, dto.legalEntityId);
    if (company !== undefined) data.legalEntityId = company;
    if (dto.type !== undefined) data.type = dto.type === 'COMPANY' ? 'COMPANY' : 'PERSON';
    if (dto.details !== undefined) data.details = jsonColumn(sanitizeDetails(dto.details) ?? []);
    if (dto.managerIds !== undefined)
      data.managerIds = await this.keepOrgUserIds(sanitizeIds(dto.managerIds) ?? [], organizationId);
    // Cross-tenant guards: refs (space/portal) and ownerId must belong to the org.
    await this.assertRefsInOrg(dto, organizationId);
    if (dto.ownerId !== undefined)
      data.ownerId = dto.ownerId ? ((await this.keepOrgUserIds([dto.ownerId], organizationId))[0] ?? null) : null;

    // ── Smart app-access handoff ──
    // When a customer gains app access, they're self-serve: sales stops working
    // them. Clear the assigned managers and settle the stage to CUSTOMER. This
    // is the single source of truth so every path (invite, manual toggle) agrees.
    const becameApp = dto.isPortalResident === true && !existing.isPortalResident;
    if (becameApp) {
      data.managerIds = [];
      if (dto.status === undefined) data.status = 'CUSTOMER';
    }

    const finalStatus = (data.status as string | undefined) ?? existing.status;
    const customer = await this.prisma.customer.update({
      where: { id },
      data: withContactKeys(data),
      select: customerSelect,
    });

    // Auto-log a lifecycle-stage change onto the CRM timeline.
    if (data.status !== undefined && data.status !== existing.status) {
      await this.prisma.customerActivity.create({
        data: {
          organizationId,
          customerId: id,
          type: 'STATUS',
          authorId: actorId ?? null,
          metadata: { from: existing.status, to: finalStatus },
        },
      });
    }
    // Note the handoff explicitly so the timeline explains why managers cleared.
    if (becameApp) {
      await this.prisma.customerActivity.create({
        data: {
          organizationId,
          customerId: id,
          type: 'SYSTEM',
          authorId: actorId ?? null,
          body: 'Gained app access — sales handoff complete, managers unassigned.',
        },
      });
    }
    return { data: customer };
  }
}
