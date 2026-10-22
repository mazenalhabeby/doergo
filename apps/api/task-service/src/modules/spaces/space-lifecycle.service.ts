import {
  Inject,
  Injectable,
  NotFoundException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import { SERVICE_NAMES, success, activeShareCount } from '@hbcfield/shared';
import { sendRpc, spacePurgeAuthSide } from '@hbcfield/shared/microservices';
import { PrismaService } from '@hbcfield/shared';
import { SpaceServiceBase } from './space-service.base';

/** A workspace's life: the default one, archiving, purging. */
@Injectable()
export class SpaceLifecycleService extends SpaceServiceBase {
  constructor(
    prisma: PrismaService,
    @Inject(SERVICE_NAMES.NOTIFICATION) notificationClient: ClientProxy,
    @Inject(SERVICE_NAMES.AUTH) private readonly authClient: ClientProxy,
  ) {
    super(prisma, notificationClient);
  }

  /** auth-service drops what it owns for the workspace (portal categories, old shares) — docs/data-ownership.md, group B. */
  private async purgeAuthSide(organizationId: string, spaceId: string): Promise<void> {
    let reply: { success: boolean; message?: string };
    try {
      reply = await firstValueFrom(
        sendRpc(this.authClient, spacePurgeAuthSide, { organizationId, spaceId }).pipe(timeout(30_000)),
      );
    } catch (e) {
      this.logger.error(`space_purge_auth_side failed for ${spaceId}: ${(e as Error)?.message ?? e}`);
      throw new ServiceUnavailableException('Could not remove this space yet. Nothing was deleted — try again.');
    }
    if (!reply.success) throw new BadRequestException(reply.message ?? 'This space cannot be removed yet.');
  }
  /**
   * Update a company location
   */
  /**
   * Move the "default" flag to another space.
   *
   * The flag decides where a task with no space of its own lands, and it was
   * set ONCE when the first space was created and never again. Deleting the
   * default was refused with "make another space the default first" — advice
   * the product had no way to follow, so an organization whose first space
   * turned out to be the wrong one was stuck with it permanently.
   *
   * Exactly one default, always. Cleared and set inside ONE transaction, so a
   * crash between the two writes cannot leave an organization with two defaults
   * (a task lands in whichever is found first) or none (it lands nowhere and
   * disappears from every space view).
   *
   * The Remote bucket is refused: it is hidden from pickers and geofence-exempt,
   * so making it the default would file unassigned work somewhere nobody looks.
   */
  async setDefault(data: { id: string; organizationId: string }) {
    const target = await this.prisma.companyLocation.findFirst({
      where: { id: data.id, organizationId: data.organizationId },
      select: { id: true, name: true, isActive: true, isRemote: true, isDefault: true },
    });
    if (!target) throw new NotFoundException('Company location not found');

    if (target.isDefault) {
      // Not an error — the caller asked for a state that already holds.
      return { id: target.id, isDefault: true, changed: false };
    }
    if (!target.isActive) {
      throw new BadRequestException('An archived workspace cannot be the default — restore it first.');
    }
    if (target.isRemote) {
      throw new BadRequestException(
        'The Remote workspace cannot be the default — it is hidden from pickers, so unassigned work would land where nobody looks.',
      );
    }

    await this.prisma.$transaction([
      this.prisma.companyLocation.updateMany({
        where: { organizationId: data.organizationId, isDefault: true },
        data: { isDefault: false },
      }),
      this.prisma.companyLocation.update({
        where: { id: target.id },
        data: { isDefault: true },
      }),
    ]);

    this.logger.log(`Default space for org ${data.organizationId} → "${target.name}" (${target.id})`);
    return { id: target.id, isDefault: true, changed: true };
  }

  /**
   * Soft delete a company location (set isActive to false)
   */
  async remove(data: { id: string; organizationId: string; userId: string }) {
    // Verify location exists and belongs to organization
    const existing = await this.prisma.companyLocation.findFirst({
      where: {
        id: data.id,
        organizationId: data.organizationId,
      },
      include: { _count: { select: { tasks: true } } },
    });

    if (!existing) {
      throw new NotFoundException('Company location not found');
    }

    // Structural spaces are never deletable: the default bucket holds
    // otherwise-unassigned tasks, and the Remote bucket backs WFH clock-ins.
    if (existing.isDefault) {
      throw new BadRequestException('The default space cannot be deleted. Make another space the default first.');
    }
    if (existing.isRemote) {
      throw new BadRequestException('The Remote space is required for remote clock-ins and cannot be deleted.');
    }

    // Move this space's tasks to the org's default space so nothing is orphaned
    // in a deactivated space (falls back to null → unassigned if no default),
    // then deactivate — atomically, so a crash can't leave tasks stranded on a
    // still-active space or double-apply.
    const { location, tasksReassigned } = await this.prisma.$transaction(async (tx) => {
      let reassigned = 0;
      if (existing._count.tasks > 0) {
        const fallback = await tx.companyLocation.findFirst({
          where: {
            organizationId: data.organizationId,
            isDefault: true,
            isActive: true,
            id: { not: data.id },
          },
          select: { id: true },
        });
        const res = await tx.task.updateMany({
          where: { spaceId: data.id },
          data: { spaceId: fallback?.id ?? null },
        });
        reassigned = res.count;
      }
      const loc = await tx.companyLocation.update({
        where: { id: data.id },
        data: { isActive: false },
      });
      return { location: loc, tasksReassigned: reassigned };
    });

    this.logger.log(`Company location deactivated: ${location.id} (tasks reassigned: ${tasksReassigned})`);
    this.announce('space_changed', data.organizationId, location.id);
    return success({ ...location, tasksReassigned }, 'Company location deleted successfully');
  }

  /**
   * PERMANENTLY delete a company location. Only allowed when the space carries
   * no history (tasks, attendance, shifts, overtime, customers, recurring
   * templates) — spaces with history must stay archived (deactivated) so
   * payroll and job records keep their references.
   */
  async purge(data: { id: string; organizationId: string; userId: string }) {
    const existing = await this.prisma.companyLocation.findFirst({
      where: { id: data.id, organizationId: data.organizationId },
      include: {
        _count: {
          select: {
            tasks: true,
            timeEntries: true,
            shifts: true,
            shiftAssignments: true,
            overtimeRequests: true,
            recurringTemplates: true,
            customers: true,
            customerUnits: true,
            // Audit S-B1 — these were NOT probed, and every one of them loses data:
            //  · assetCategories cascades on space delete, so the space's whole asset
            //    taxonomy goes with it and its assets are left uncategorised
            //    (that is what the "orphan assets" card exists to mop up);
            //  · ownedWorkflows ALSO cascades — and a workflow owned by this space can
            //    be offered to OTHER spaces, whose SpaceWorkflow rows cascade away and
            //    whose tasks have workflowId set to NULL. A space with no tasks of its
            //    own could therefore break another space's board;
            //  · sprints / epics / phases detach (SetNull) and silently lose their space.
            assetCategories: true,
            ownedWorkflows: true,
            sprints: true,
            epics: true,
            phases: true,
          },
        },
      },
    });
    if (!existing) throw new NotFoundException('Company location not found');
    if (existing.isDefault) {
      throw new BadRequestException('The default space cannot be deleted. Make another space the default first.');
    }
    if (existing.isRemote) {
      throw new BadRequestException('The Remote space is required for remote clock-ins and cannot be deleted.');
    }

    const c = existing._count;
    const blockers: string[] = [];
    if (c.tasks > 0) blockers.push(`${c.tasks} task(s)`);
    if (c.timeEntries > 0) blockers.push(`${c.timeEntries} attendance record(s)`);
    if (c.shifts > 0 || c.shiftAssignments > 0) blockers.push('shift schedule');
    if (c.overtimeRequests > 0) blockers.push('overtime requests');
    if (c.recurringTemplates > 0) blockers.push(`${c.recurringTemplates} recurring task template(s)`);
    if (c.customers > 0 || c.customerUnits > 0) blockers.push('customer records');
    if (c.assetCategories > 0) blockers.push(`${c.assetCategories} asset kind(s)`);
    if (c.ownedWorkflows > 0) blockers.push(`${c.ownedWorkflows} task type(s) defined here`);
    if (c.sprints > 0) blockers.push(`${c.sprints} sprint(s)`);
    if (c.epics > 0) blockers.push(`${c.epics} epic(s)`);
    if (c.phases > 0) blockers.push(`${c.phases} phase(s)`);

    // An ACTIVE cross-org share is another organization's access. Deleting the space
    // revokes it with no notice to them, and — because SpaceShare.spaceId carries no
    // foreign key — leaves the grant row behind pointing at a space that no longer
    // exists (audit S-B2). Make the owner unshare deliberately first.
    const activeShares = await activeShareCount(this.prisma, data.id);
    if (activeShares > 0) {
      blockers.push(`${activeShares} organization(s) this space is shared with — unshare first`);
    }

    if (blockers.length > 0) {
      throw new BadRequestException(
        `This space still has history (${blockers.join(', ')}) and can only be deactivated. ` +
          'Permanent deletion is available for empty spaces only.',
      );
    }

    // auth-service's rows for the space go first; if it refuses, nothing here is touched.
    await this.purgeAuthSide(data.organizationId, data.id);
    // Access mappings and shift config cascade via the schema.
    await this.prisma.companyLocation.delete({ where: { id: data.id } });

    this.logger.warn(`Company location PURGED: ${existing.name} (${existing.id}) by ${data.userId}`);
    // Create, update and deactivate all announce; purge — the one that cannot be undone
    // — did not, so other admins kept seeing a space that no longer existed (S-D1).
    this.announce('space_changed', data.organizationId, data.id);
    return success({ id: existing.id }, 'Space permanently deleted');
  }
}
