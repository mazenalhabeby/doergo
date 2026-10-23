import { Inject, Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { success, PrismaService } from '@hbcfield/shared';
import { assertSpaceInOrg } from '../../common/tenant-scope.util';
import { WorkflowConfigCache } from './config-cache/workflow-config-cache.service';
import { WorkflowsService } from './workflows.service';
import { SpaceWorkflowsService } from './space-workflows.service';

/** Sharing a workspace's workflow with the organization, and forking one into a workspace. */
@Injectable()
export class WorkflowSharingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workflowCache: WorkflowConfigCache,
  ) {}

  @Inject(WorkflowsService) private readonly workflows!: WorkflowsService;

  @Inject(SpaceWorkflowsService) private readonly spaceWorkflows!: SpaceWorkflowsService;

  /**
   * Widen a space's own task type to the whole organization.
   *
   * Safe in a way narrowing is not: nothing that could offer it before stops
   * being able to, and no task's state machine changes. Only the set of spaces
   * ALLOWED to offer it grows.
   *
   * The name has to be free at the new level, because it is about to compete
   * with the organization's other shared types rather than this space's.
   */
  async shareWithOrganization(data: { workflowId: string; organizationId: string }) {
    const wf = await this.prisma.statusWorkflow.findFirst({
      where: { id: data.workflowId, organizationId: data.organizationId },
      select: { id: true, name: true, ownerSpaceId: true },
    });
    if (!wf) throw new NotFoundException('Task type not found');
    if (!wf.ownerSpaceId) return success({ workflowId: wf.id, alreadyShared: true });

    const clash = await this.prisma.statusWorkflow.findFirst({
      where: {
        organizationId: data.organizationId,
        ownerSpaceId: null,
        name: { equals: wf.name, mode: 'insensitive' },
      },
      select: { id: true },
    });
    if (clash) {
      throw new ConflictException(
        `The organization already has a task type named "${wf.name}". Rename this one before sharing it.`,
      );
    }

    await this.prisma.statusWorkflow.update({ where: { id: wf.id }, data: { ownerSpaceId: null } });
    await this.workflowCache.invalidate(data.organizationId);
    return success({ workflowId: wf.id, alreadyShared: false });
  }

  /**
   * Take a space's own copy of a shared task type, so it can diverge.
   *
   * The original is left offered here deliberately. Tasks already moving
   * through it still point at it, and pulling it out from under them would
   * leave them on a flow the space no longer presents. So the space shows both
   * until the old work finishes, and removing the original is a decision
   * somebody makes when they can see it is empty.
   */
  async forkForSpace(data: { workflowId: string; spaceId: string; organizationId: string }) {
    await assertSpaceInOrg(this.prisma, data.spaceId, data.organizationId);

    const source = await this.prisma.statusWorkflow.findFirst({
      where: { id: data.workflowId, organizationId: data.organizationId },
      select: {
        name: true,
        ownerSpaceId: true,
        statuses: {
          orderBy: { position: 'asc' },
          select: {
            name: true,
            key: true,
            color: true,
            icon: true,
            position: true,
            isFinal: true,
            isCanceled: true,
            transitions: true,
            capabilities: true,
            form: true,
          },
        },
      },
    });
    if (!source) throw new NotFoundException('Task type not found');
    if (source.ownerSpaceId === data.spaceId) {
      throw new BadRequestException('This task type already belongs to this space.');
    }

    // A name free among THIS space's own types. The shared original keeps its
    // name; the copy takes the first free variant so both can be told apart.
    const name = await this.freeLocalName(source.name, data.spaceId, data.organizationId);

    const created = await this.workflows.create({
      name,
      organizationId: data.organizationId,
      ownerSpaceId: data.spaceId,
      statuses: source.statuses.map((st) => ({
        ...st,
        icon: st.icon ?? undefined,
      })),
    });
    const forkId = created?.data?.id;
    if (forkId) {
      await this.spaceWorkflows.attachSpaceWorkflow({
        spaceId: data.spaceId,
        workflowId: forkId,
        organizationId: data.organizationId,
      });
    }
    return success({ workflowId: forkId, name });
  }

  /** The first name this space does not already use for one of its own types. */
  private async freeLocalName(base: string, spaceId: string, organizationId: string): Promise<string> {
    const rows = await this.prisma.statusWorkflow.findMany({
      where: { organizationId, ownerSpaceId: spaceId },
      select: { name: true },
    });
    const used = new Set(rows.map((r) => r.name.toLowerCase()));
    if (!used.has(base.toLowerCase())) return base;
    for (let i = 2; i < 200; i++) {
      const candidate = `${base} (${i})`;
      if (!used.has(candidate.toLowerCase())) return candidate;
    }
    throw new ConflictException('Could not find a free name for the copy.');
  }
}
