import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import {
  success,
  missingModulesForWorkflow,
  explainModuleRequirement,
  validateWorkflow,
  summarizeWorkflowProblems,
  spaceMayOffer,
  assertFoundInOrg,
  orgModules,
} from '@hbcfield/shared';
import { assertSpaceInOrg, assertWorkflowInOrg } from '../../common/tenant-scope.util';
import { resolveSpaceDefaultWorkflowId } from '../../common/space-workflow.util';
import { WorkflowServiceBase } from './workflow-service.base';

/** Workflows in a workspace: which it uses, attaching and detaching one, the default. */
@Injectable()
export class SpaceWorkflowsService extends WorkflowServiceBase {
  /**
   * Set a workflow as the organization default
   */
  async setDefault(data: { id: string; organizationId: string }) {
    const existing = await this.prisma.statusWorkflow.findUnique({
      where: { id: data.id },
    });

    assertFoundInOrg(existing, data.organizationId, 'Workflow');

    // The organization default is the fallback for anything with no other
    // answer, so it has to be a type every space could actually use.
    if (existing.ownerSpaceId) {
      throw new BadRequestException(
        'This task type belongs to one space, so it cannot be the organization default. Share it with the organization first.',
      );
    }

    // Unset previous default and set new one in a transaction
    await this.prisma.$transaction([
      this.prisma.statusWorkflow.updateMany({
        where: { organizationId: data.organizationId, isDefault: true },
        data: { isDefault: false },
      }),
      this.prisma.statusWorkflow.update({
        where: { id: data.id },
        data: { isDefault: true },
      }),
    ]);

    const workflow = await this.prisma.statusWorkflow.findUnique({
      where: { id: data.id },
      include: {
        statuses: { orderBy: { position: 'asc' } },
        _count: { select: { tasks: true } },
      },
    });

    await this.workflowCache.invalidate(data.organizationId);
    return success(workflow);
  }
  // ─── Which workflows a space offers ─────────────────────────────────────────

  /**
   * The workflows this space offers, default first.
   *
   * Falls back to describing CompanyLocation.workflowId as a single offering,
   * so a space with no rows yet answers exactly as it did before the join
   * existed.
   */
  async listSpaceWorkflows(data: { spaceId: string; organizationId: string }) {
    await assertSpaceInOrg(this.prisma, data.spaceId, data.organizationId);

    const rows = await this.prisma.spaceWorkflow.findMany({
      where: { spaceId: data.spaceId },
      orderBy: [{ isDefault: 'desc' }, { position: 'asc' }],
      include: { workflow: { include: { statuses: { orderBy: { position: 'asc' } } } } },
    });
    if (rows.length > 0) {
      return success(rows.map((r) => ({ ...r.workflow, isDefault: r.isDefault, position: r.position })));
    }

    const fallbackId = await resolveSpaceDefaultWorkflowId(this.prisma, data.spaceId);
    if (!fallbackId) return success([]);
    const wf = await this.prisma.statusWorkflow.findFirst({
      where: { id: fallbackId, organizationId: data.organizationId },
      include: { statuses: { orderBy: { position: 'asc' } } },
    });
    return success(wf ? [{ ...wf, isDefault: true, position: 0 }] : []);
  }

  /**
   * Offer a workflow in a space.
   *
   * Refused when the space has not enabled what the workflow's steps need — a
   * step that asks for a route recording is decoration where route tracking is
   * off, and a task would reach it and be unable to do the thing it asks for.
   * The refusal names the modules AND the steps that need them, because "not
   * allowed" sends someone hunting.
   */
  async attachSpaceWorkflow(data: {
    spaceId: string;
    workflowId: string;
    organizationId: string;
    makeDefault?: boolean;
  }) {
    await assertSpaceInOrg(this.prisma, data.spaceId, data.organizationId);
    await assertWorkflowInOrg(this.prisma, data.workflowId, data.organizationId);

    const [space, workflow] = await Promise.all([
      this.prisma.companyLocation.findUnique({
        where: { id: data.spaceId },
        select: { enabledModules: true, organizationId: true },
      }),
      this.prisma.statusWorkflow.findUnique({
        where: { id: data.workflowId },
        select: {
          ownerSpaceId: true,
          capabilities: true,
          statuses: {
            select: {
              key: true,
              name: true,
              position: true,
              isFinal: true,
              isCanceled: true,
              transitions: true,
              capabilities: true,
            },
          },
        },
      }),
    ]);
    if (!space || !workflow) throw new NotFoundException('Space or task type not found');

    /*
      A task type scoped to one space belongs to that space alone.

      Offering it elsewhere would make "local" mean nothing, and would quietly
      hand a second space edit rights over a flow the first believes is private
      — the edit would land on both. Widening is a deliberate act ("share with
      the organization"), not a side effect of adding it somewhere.
    */
    if (!spaceMayOffer(workflow, data.spaceId)) {
      throw new BadRequestException(
        'That task type belongs to another space. Share it with the organization, or fork your own copy.',
      );
    }

    /*
      Is it sound enough to run work through?

      Checked HERE rather than on every edit. A workflow with one step is
      legitimately unfinished, not wrong, and refusing each save would make the
      builder hostile to the act of building. It becomes a problem the moment
      someone tries to USE it — which is this call, and task creation.

      Every problem at once, so whoever fixes it sees the whole list instead of
      discovering the next fault after each attempt.
    */
    const problems = validateWorkflow(workflow.statuses);
    if (problems.length > 0) {
      // Summarised, not listed. One sentence per fault meant ten near-identical
      // sentences in a toast, which hides the one fact that matters. The editor
      // still marks each step individually, where per-step detail belongs.
      throw new BadRequestException(`This task type is not finished — ${summarizeWorkflowProblems(problems)}.`);
    }

    // A space with no override inherits its organization's modules.
    let enabled = (space.enabledModules as string[] | null) ?? null;
    if (!enabled) {
      const org = await orgModules(this.prisma, space.organizationId);
      enabled = (org?.enabledModules as string[] | null) ?? [];
    }

    const missing = missingModulesForWorkflow(workflow.statuses, enabled, workflow.capabilities);
    if (missing.length > 0) {
      const detail = missing
        .map((m) => {
          const why = explainModuleRequirement(workflow.statuses, workflow.capabilities, m);
          return why ? `${m} (${why})` : m;
        })
        .join('; ');
      throw new BadRequestException(`This task type needs modules this space has not enabled: ${detail}`);
    }

    const position = await this.prisma.spaceWorkflow.count({ where: { spaceId: data.spaceId } });
    const row = await this.prisma.spaceWorkflow.upsert({
      where: { spaceId_workflowId: { spaceId: data.spaceId, workflowId: data.workflowId } },
      create: { spaceId: data.spaceId, workflowId: data.workflowId, position, isDefault: false },
      update: {},
    });

    // First offering, or asked for — become the default. Cleared elsewhere first
    // because at most one row per space may claim it (a partial unique index
    // makes two an impossible state rather than a merely discouraged one).
    if (data.makeDefault || position === 0) {
      // The space was verified at the top of this method; going through the
      // public entry point would verify it a second time on the same request.
      await this.applySpaceDefault(data.spaceId, data.workflowId);
    }
    return success(row);
  }

  /** Stop offering a workflow here. The default may not be removed while others remain. */
  async detachSpaceWorkflow(data: { spaceId: string; workflowId: string; organizationId: string }) {
    await assertSpaceInOrg(this.prisma, data.spaceId, data.organizationId);

    const row = await this.prisma.spaceWorkflow.findUnique({
      where: { spaceId_workflowId: { spaceId: data.spaceId, workflowId: data.workflowId } },
      select: { isDefault: true },
    });
    if (!row) return success({ removed: 0 });

    const total = await this.prisma.spaceWorkflow.count({ where: { spaceId: data.spaceId } });
    if (row.isDefault && total > 1) {
      throw new BadRequestException('Make another task type the default before removing this one');
    }

    await this.prisma.spaceWorkflow.delete({
      where: { spaceId_workflowId: { spaceId: data.spaceId, workflowId: data.workflowId } },
    });
    return success({ removed: 1 });
  }

  /** Which offering new tasks inherit. Exactly one, enforced by the database. */
  async setSpaceDefaultWorkflow(data: { spaceId: string; workflowId: string; organizationId: string }) {
    await assertSpaceInOrg(this.prisma, data.spaceId, data.organizationId);
    await this.applySpaceDefault(data.spaceId, data.workflowId);
    return success({ spaceId: data.spaceId, workflowId: data.workflowId });
  }

  /**
   * The write itself, with the tenancy check left to the caller.
   *
   * Private so the check can never be skipped from outside — the two callers
   * both make it, and attaching would otherwise make it twice in one request.
   */
  private async applySpaceDefault(spaceId: string, workflowId: string) {
    await this.prisma.$transaction([
      // Cleared first: the partial unique index refuses two defaults, so setting
      // before clearing would fail rather than replace.
      this.prisma.spaceWorkflow.updateMany({
        where: { spaceId, isDefault: true },
        data: { isDefault: false },
      }),
      this.prisma.spaceWorkflow.updateMany({
        where: { spaceId, workflowId },
        data: { isDefault: true },
      }),
    ]);
  }
}
