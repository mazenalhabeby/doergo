import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@hbcfield/shared';
import { WorkflowConfigCache } from './config-cache/workflow-config-cache.service';
import { assertFoundInOrg } from '@hbcfield/shared';

/** What the workflow services share: their dependencies and finding one step of a workflow. */
@Injectable()
export abstract class WorkflowServiceBase {
  protected readonly logger = new Logger(this.constructor.name);

  constructor(
    protected readonly prisma: PrismaService,
    protected readonly workflowCache: WorkflowConfigCache,
  ) {}

  /** A step of one of this organization's workflows — or 404, whichever part is missing. */
  protected async stepOf(data: { workflowId: string; statusId: string; organizationId: string }) {
    const workflow = await this.prisma.statusWorkflow.findUnique({ where: { id: data.workflowId } });
    assertFoundInOrg(workflow, data.organizationId, 'Workflow');
    const step = await this.prisma.workflowStatus.findUnique({ where: { id: data.statusId } });
    if (!step || step.workflowId !== data.workflowId) {
      throw new NotFoundException('Status not found in this workflow');
    }
    return step;
  }
}
