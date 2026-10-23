import type { Prisma } from '@prisma/client';
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { type CrmCaller } from '../customers/customers.service';
import { type SpaceScopeIds, activeAssignmentWhere, memberActiveIn, PrismaService } from '@hbcfield/shared';
import { sanitizeUnitDetails } from './portal-helpers';
import { PortalReachService } from './portal-reach.service';
import { UnitResidentsService } from './unit-residents.service';
import { unitScope } from './portal-scope';
import { type portalCreateUnit, type portalUpdateUnit, type RpcRequest } from '@hbcfield/shared/microservices';
import { jsonColumn, optionalJsonColumn } from '../../common/records/json-column';

/** Changing addresses (units): create, edit, delete, and a member's home address. */
@Injectable()
export class UnitWriteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reach: PortalReachService,
    private readonly residents: UnitResidentsService,
  ) {}

  // The request is the message contract's (shared with the gateway) — one definition, not two.
  async createUnit(data: RpcRequest<typeof portalCreateUnit>) {
    if (data.crmCaller) {
      if (!data.customerId) throw new BadRequestException('A client is required');
      await this.reach.assertClientAddressesEditable(data.organizationId, data.customerId, data.crmCaller);
    }
    await this.reach.assertUnitRefsInOrg(data.organizationId, { spaceId: data.spaceId, portalId: data.portalId });
    await this.reach.assertUnitRefsInScope(
      data.organizationId,
      data.scopeSpaceIds,
      { spaceId: data.spaceId, portalId: data.portalId, customerId: data.customerId },
      { anchor: true },
    );
    // Resident is a MEMBER or a CLIENT, never both. A valid member wins.
    const residentUserId = data.residentUserId
      ? ((await this.residents.keepOrgUserIds([data.residentUserId], data.organizationId))[0] ?? null)
      : null;
    const clientId = residentUserId ? null : data.customerId || null;
    const c = await this.reach.assertCustomerInOrg(data.organizationId, clientId || undefined);
    data.customerId = clientId || undefined;
    // First address for a customer becomes primary automatically.
    const existing = data.customerId
      ? await this.prisma.customerUnit.count({ where: { customerId: data.customerId } })
      : 0;
    const isPrimary = data.isPrimary ?? existing === 0;
    if (isPrimary && data.customerId) {
      await this.prisma.customerUnit.updateMany({ where: { customerId: data.customerId }, data: { isPrimary: false } });
    }
    const created = await this.prisma.customerUnit.create({
      data: {
        organizationId: data.organizationId,
        customerId: data.customerId || null,
        portalId: data.portalId || c?.portalId || null,
        name: data.name,
        label: data.label || null,
        address: data.address || null,
        lat: data.lat ?? null,
        lng: data.lng ?? null,
        isPrimary,
        spaceId: data.spaceId || null,
        contactName: data.contactName || null,
        contactPhone: data.contactPhone || null,
        residentUserId,
        details: optionalJsonColumn(sanitizeUnitDetails(data.details)),
      },
    });
    // A member lives in exactly one apartment per space — vacate any prior one.
    if (residentUserId)
      await this.residents.clearMemberElsewhere(residentUserId, data.spaceId, data.organizationId, created.id);
    // Activity: created + initial resident (best-effort, never blocks).
    await this.residents.logUnitActivity({
      unitId: created.id,
      organizationId: data.organizationId,
      type: 'SYSTEM',
      authorId: data.actorId,
      body: 'Apartment created',
    });
    const rn = await this.residents.residentDisplayName(residentUserId, clientId, data.organizationId);
    if (rn)
      await this.residents.logUnitActivity({
        unitId: created.id,
        organizationId: data.organizationId,
        type: 'SYSTEM',
        authorId: data.actorId,
        body: `Resident set to ${rn}`,
        metadata: { resident: rn },
      });
    return created;
  }

  // The request is the message contract's (shared with the gateway) — one definition, not two.
  async updateUnit(data: RpcRequest<typeof portalUpdateUnit>) {
    if (data.crmCaller) {
      // The CRM route always scopes to the client in its path; no scope, no edit.
      if (!data.scopeCustomerId) throw new BadRequestException('A client is required');
      await this.reach.assertClientAddressesEditable(data.organizationId, data.scopeCustomerId, data.crmCaller);
    }
    await this.reach.assertUnitRefsInOrg(data.organizationId, { spaceId: data.spaceId, portalId: data.portalId });
    await this.reach.assertUnitRefsInScope(data.organizationId, data.scopeSpaceIds, {
      spaceId: data.spaceId,
      portalId: data.portalId,
      customerId: data.customerId,
    });
    const existing = await this.prisma.customerUnit.findFirst({
      where: {
        id: data.id,
        organizationId: data.organizationId,
        ...(data.scopeCustomerId ? { customerId: data.scopeCustomerId } : {}),
        ...(data.scopeSpaceId ? { spaceId: data.scopeSpaceId } : {}),
        ...unitScope(data.scopeSpaceIds),
      },
      select: { id: true, customerId: true, residentUserId: true, spaceId: true },
    });
    if (!existing) throw new NotFoundException('Unit not found');
    await this.reach.assertCustomerInOrg(data.organizationId, data.customerId);
    // Resident is a MEMBER or a CLIENT, never both — setting one clears the other.
    const residentUserId =
      data.residentUserId !== undefined
        ? data.residentUserId
          ? ((await this.residents.keepOrgUserIds([data.residentUserId], data.organizationId))[0] ?? null)
          : null
        : undefined;
    if (data.isPrimary && existing.customerId) {
      await this.prisma.customerUnit.updateMany({
        where: { customerId: existing.customerId, id: { not: existing.id } },
        data: { isPrimary: false },
      });
    }
    const updated = await this.prisma.customerUnit.update({
      where: { id: data.id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.label !== undefined ? { label: data.label } : {}),
        ...(data.address !== undefined ? { address: data.address } : {}),
        ...(data.lat !== undefined ? { lat: data.lat } : {}),
        ...(data.lng !== undefined ? { lng: data.lng } : {}),
        ...(data.isPrimary !== undefined ? { isPrimary: data.isPrimary } : {}),
        ...(data.spaceId !== undefined ? { spaceId: data.spaceId } : {}),
        ...(data.portalId !== undefined ? { portalId: data.portalId } : {}),
        ...(data.contactName !== undefined ? { contactName: data.contactName } : {}),
        ...(data.contactPhone !== undefined ? { contactPhone: data.contactPhone } : {}),
        // Member resident → clear client; client resident → clear member.
        ...(residentUserId !== undefined ? { residentUserId, ...(residentUserId ? { customerId: null } : {}) } : {}),
        ...(data.customerId !== undefined
          ? { customerId: data.customerId, ...(data.customerId ? { residentUserId: null } : {}) }
          : {}),
        ...(data.details !== undefined ? { details: jsonColumn(sanitizeUnitDetails(data.details) ?? []) } : {}),
      },
    });
    // A member lives in exactly one apartment per space — vacate any prior one
    // (spaceId may move in the same call, so prefer the new one).
    if (residentUserId)
      await this.residents.clearMemberElsewhere(
        residentUserId,
        data.spaceId ?? existing.spaceId,
        data.organizationId,
        updated.id,
      );
    // Activity: log a resident change (best-effort).
    if (updated.residentUserId !== existing.residentUserId || updated.customerId !== existing.customerId) {
      const rn = await this.residents.residentDisplayName(
        updated.residentUserId,
        updated.customerId,
        data.organizationId,
      );
      await this.residents.logUnitActivity({
        unitId: updated.id,
        organizationId: data.organizationId,
        type: 'SYSTEM',
        authorId: data.actorId,
        body: rn ? `Resident set to ${rn}` : 'Resident removed',
        metadata: rn ? { resident: rn } : undefined,
      });
    }
    return updated;
  }

  /** Assign (or clear) a MEMBER's apartment from the member side — the reverse
   *  of picking a resident on the apartment. `unitId=null` vacates the member.
   *  Atomic + one-home-per-member-per-space; mirrors the apartment-side write so
   *  both surfaces agree on `residentUserId`. */
  async setMemberApartment(data: {
    organizationId: string;
    spaceId: string;
    userId: string;
    unitId?: string | null;
    actorId?: string;
  }) {
    const [uid] = await this.residents.keepOrgUserIds([data.userId], data.organizationId);
    if (!uid) throw new NotFoundException('Member not found in this organization');
    /*
      Only somebody who works in THIS workspace can live in one of its apartments
      as a member resident. Without it a workspace-scoped manager could attach
      any person in the organization — someone they cannot otherwise see — to
      their site's apartment.
    */
    const assigned = await memberActiveIn(this.prisma, uid, data.spaceId, data.organizationId);
    if (!assigned) throw new NotFoundException('Member not found in this workspace');

    // Validate the target apartment belongs to this org + space.
    let targetId: string | null = null;
    if (data.unitId) {
      const target = await this.prisma.customerUnit.findFirst({
        where: { id: data.unitId, organizationId: data.organizationId, spaceId: data.spaceId, isActive: true },
        select: { id: true },
      });
      if (!target) throw new NotFoundException('Apartment not found in this space');
      targetId = target.id;
    }

    // Where does the member live now (in this space)?
    const current = await this.prisma.customerUnit.findMany({
      where: { organizationId: data.organizationId, spaceId: data.spaceId, residentUserId: uid },
      select: { id: true },
    });
    const currentIds = current.map((u) => u.id);
    const toClear = currentIds.filter((id) => id !== targetId);

    const ops: Prisma.PrismaPromise<unknown>[] = [];
    if (toClear.length)
      ops.push(this.prisma.customerUnit.updateMany({ where: { id: { in: toClear } }, data: { residentUserId: null } }));
    if (targetId && !currentIds.includes(targetId))
      ops.push(
        this.prisma.customerUnit.update({ where: { id: targetId }, data: { residentUserId: uid, customerId: null } }),
      );
    if (ops.length) await this.prisma.$transaction(ops);

    // Activity (best-effort, never blocks the write).
    for (const id of toClear)
      void this.residents.logUnitActivity({
        unitId: id,
        organizationId: data.organizationId,
        type: 'SYSTEM',
        authorId: data.actorId,
        body: 'Resident removed',
      });
    if (targetId && !currentIds.includes(targetId)) {
      const rn = await this.residents.residentDisplayName(uid, null, data.organizationId);
      void this.residents.logUnitActivity({
        unitId: targetId,
        organizationId: data.organizationId,
        type: 'SYSTEM',
        authorId: data.actorId,
        body: rn ? `Resident set to ${rn}` : 'Resident set',
        metadata: rn ? { resident: rn } : undefined,
      });
    }
    return { data: { success: true, unitId: targetId } };
  }

  async deleteUnit(data: {
    id: string;
    organizationId: string;
    customerId?: string;
    /** The workspace route's own workspace — see `updateUnit.scopeSpaceId`. */
    scopeSpaceId?: string;
    crmCaller?: CrmCaller;
    scopeSpaceIds?: SpaceScopeIds;
  }) {
    if (data.crmCaller) {
      if (!data.customerId) throw new BadRequestException('A client is required');
      await this.reach.assertClientAddressesEditable(data.organizationId, data.customerId, data.crmCaller);
    }
    const existing = await this.prisma.customerUnit.findFirst({
      where: {
        id: data.id,
        organizationId: data.organizationId,
        ...(data.customerId ? { customerId: data.customerId } : {}),
        ...(data.scopeSpaceId ? { spaceId: data.scopeSpaceId } : {}),
        ...unitScope(data.scopeSpaceIds),
      },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Unit not found');
    await this.prisma.customerUnit.update({ where: { id: data.id }, data: { isActive: false } });
    return { success: true };
  }
}
