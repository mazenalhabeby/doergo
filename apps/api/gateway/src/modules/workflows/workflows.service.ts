import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { SERVICE_NAMES, BaseGatewayService } from '@hbcfield/shared';
import {
  pattern,
  addWorkflowStatus,
  attachSpaceWorkflow,
  createWorkflow,
  deleteDefinitionOfDone,
  deleteWorkflow,
  deleteWorkflowStatus,
  detachSpaceWorkflow,
  findAllWorkflows,
  findWorkflow,
  forkWorkflowForSpace,
  getDefinitionOfDone,
  listSpaceWorkflows,
  listWorkflowTemplates,
  reorderWorkflowStatuses,
  setDefaultWorkflow,
  setSpaceDefaultWorkflow,
  shareWorkflowWithOrg,
  submitWorkflowToLibrary,
  updateWorkflow,
  updateWorkflowStatus,
  upsertDefinitionOfDone,
  useWorkflowTemplate,
  type RpcRequest,
} from '@hbcfield/shared/microservices';

/**
 * Gateway service for Status Workflow operations.
 * Uses direct microservice communication (no BullMQ needed for simple CRUD).
 */
@Injectable()
export class WorkflowsService extends BaseGatewayService {
  constructor(@Inject(SERVICE_NAMES.TASK) taskClient: ClientProxy) {
    super(taskClient, WorkflowsService.name);
  }

  async findAll(data: { organizationId: string }) {
    return this.send(pattern(findAllWorkflows), data satisfies RpcRequest<typeof findAllWorkflows>);
  }

  async findOne(data: { id: string; organizationId: string }) {
    return this.send(pattern(findWorkflow), data satisfies RpcRequest<typeof findWorkflow>);
  }

  async create(data: RpcRequest<typeof createWorkflow>) {
    return this.send(pattern(createWorkflow), data);
  }

  async update(data: RpcRequest<typeof updateWorkflow>) {
    return this.send(pattern(updateWorkflow), data);
  }

  async remove(data: { id: string; organizationId: string }) {
    return this.send(pattern(deleteWorkflow), data satisfies RpcRequest<typeof deleteWorkflow>);
  }

  async setDefault(data: { id: string; organizationId: string }) {
    return this.send(pattern(setDefaultWorkflow), data satisfies RpcRequest<typeof setDefaultWorkflow>);
  }

  async addStatus(data: RpcRequest<typeof addWorkflowStatus>) {
    return this.send(pattern(addWorkflowStatus), data);
  }

  async updateStatus(data: RpcRequest<typeof updateWorkflowStatus>) {
    return this.send(pattern(updateWorkflowStatus), data);
  }

  async removeStatus(data: { workflowId: string; statusId: string; organizationId: string }) {
    return this.send(pattern(deleteWorkflowStatus), data satisfies RpcRequest<typeof deleteWorkflowStatus>);
  }

  async reorderStatuses(data: { workflowId: string; organizationId: string; statusIds: string[] }) {
    return this.send(pattern(reorderWorkflowStatuses), data satisfies RpcRequest<typeof reorderWorkflowStatuses>);
  }

  // Definition of Done
  async getDefinitionOfDone(data: { organizationId: string; workflowId?: string }) {
    return this.send(pattern(getDefinitionOfDone), data satisfies RpcRequest<typeof getDefinitionOfDone>);
  }

  async upsertDefinitionOfDone(data: RpcRequest<typeof upsertDefinitionOfDone>) {
    return this.send(pattern(upsertDefinitionOfDone), data);
  }

  async removeDefinitionOfDone(data: { id: string; organizationId: string }) {
    return this.send(pattern(deleteDefinitionOfDone), data satisfies RpcRequest<typeof deleteDefinitionOfDone>);
  }
  // ── Which task types a space offers ─────────────────────────────────────────

  async listSpaceWorkflows(data: { spaceId: string; organizationId: string }) {
    return this.send(pattern(listSpaceWorkflows), data satisfies RpcRequest<typeof listSpaceWorkflows>);
  }

  async attachSpaceWorkflow(data: {
    spaceId: string;
    workflowId: string;
    organizationId: string;
    makeDefault?: boolean;
  }) {
    return this.send(pattern(attachSpaceWorkflow), data satisfies RpcRequest<typeof attachSpaceWorkflow>);
  }

  async detachSpaceWorkflow(data: { spaceId: string; workflowId: string; organizationId: string }) {
    return this.send(pattern(detachSpaceWorkflow), data satisfies RpcRequest<typeof detachSpaceWorkflow>);
  }

  async setSpaceDefaultWorkflow(data: { spaceId: string; workflowId: string; organizationId: string }) {
    return this.send(pattern(setSpaceDefaultWorkflow), data satisfies RpcRequest<typeof setSpaceDefaultWorkflow>);
  }

  // ── The shared task-type library (tenant side: read + copy) ─────────────────

  async listTemplates(data: { organizationId: string }) {
    return this.send(pattern(listWorkflowTemplates), data satisfies RpcRequest<typeof listWorkflowTemplates>);
  }

  async useTemplate(data: {
    templateId: string;
    organizationId: string;
    name?: string;
    isDefault?: boolean;
    spaceId?: string;
    shareWithOrganization?: boolean;
  }) {
    return this.send(pattern(useWorkflowTemplate), data satisfies RpcRequest<typeof useWorkflowTemplate>);
  }

  async shareWithOrganization(data: { workflowId: string; organizationId: string }) {
    return this.send(pattern(shareWorkflowWithOrg), data satisfies RpcRequest<typeof shareWorkflowWithOrg>);
  }

  async forkForSpace(data: { workflowId: string; spaceId: string; organizationId: string }) {
    return this.send(pattern(forkWorkflowForSpace), data satisfies RpcRequest<typeof forkWorkflowForSpace>);
  }

  async submitToLibrary(data: { workflowId: string; organizationId: string; note?: string }) {
    return this.send(pattern(submitWorkflowToLibrary), data satisfies RpcRequest<typeof submitWorkflowToLibrary>);
  }
}
