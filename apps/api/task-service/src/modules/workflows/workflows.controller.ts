import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { WorkflowsService } from './workflows.service';
import { WorkflowLibraryService } from './workflow-library.service';

/**
 * Microservice Controller for Status Workflow Operations
 *
 * Handles direct Redis microservice calls for workflow CRUD.
 */
@Controller()
export class WorkflowsController {
  constructor(
    private readonly workflowsService: WorkflowsService,
    private readonly library: WorkflowLibraryService,
  ) {}

  @MessagePattern({ cmd: 'find_all_workflows' })
  async findAll(@Payload() data: { organizationId: string }) {
    return this.workflowsService.findAll(data);
  }

  @MessagePattern({ cmd: 'find_workflow' })
  async findOne(@Payload() data: { id: string; organizationId: string }) {
    return this.workflowsService.findOne(data);
  }

  @MessagePattern({ cmd: 'create_workflow' })
  async create(@Payload() data: any) {
    return this.workflowsService.create(data);
  }

  @MessagePattern({ cmd: 'update_workflow' })
  async update(@Payload() data: any) {
    return this.workflowsService.update(data);
  }

  @MessagePattern({ cmd: 'delete_workflow' })
  async remove(@Payload() data: { id: string; organizationId: string }) {
    return this.workflowsService.remove(data);
  }

  @MessagePattern({ cmd: 'set_default_workflow' })
  async setDefault(@Payload() data: { id: string; organizationId: string }) {
    return this.workflowsService.setDefault(data);
  }

  @MessagePattern({ cmd: 'add_workflow_status' })
  async addStatus(@Payload() data: any) {
    return this.workflowsService.addStatus(data);
  }

  @MessagePattern({ cmd: 'update_workflow_status' })
  async updateStatus(@Payload() data: any) {
    return this.workflowsService.updateStatus(data);
  }

  @MessagePattern({ cmd: 'delete_workflow_status' })
  async removeStatus(@Payload() data: { workflowId: string; statusId: string; organizationId: string }) {
    return this.workflowsService.removeStatus(data);
  }

  @MessagePattern({ cmd: 'reorder_workflow_statuses' })
  async reorderStatuses(@Payload() data: { workflowId: string; organizationId: string; statusIds: string[] }) {
    return this.workflowsService.reorderStatuses(data);
  }

  // ==================== Definition of Done ====================

  @MessagePattern({ cmd: 'get_definition_of_done' })
  async getDefinitionOfDone(@Payload() data: { organizationId: string; workflowId?: string }) {
    return this.workflowsService.getDefinitionOfDone(data);
  }

  @MessagePattern({ cmd: 'upsert_definition_of_done' })
  async upsertDefinitionOfDone(@Payload() data: any) {
    return this.workflowsService.upsertDefinitionOfDone(data);
  }

  @MessagePattern({ cmd: 'delete_definition_of_done' })
  async removeDefinitionOfDone(@Payload() data: { id: string; organizationId: string }) {
    return this.workflowsService.removeDefinitionOfDone(data);
  }
  // ── Which workflows a space offers ──────────────────────────────────────────

  @MessagePattern({ cmd: 'list_space_workflows' })
  listSpaceWorkflows(@Payload() data: { spaceId: string; organizationId: string }) {
    return this.workflowsService.listSpaceWorkflows(data);
  }

  @MessagePattern({ cmd: 'attach_space_workflow' })
  attachSpaceWorkflow(
    @Payload() data: { spaceId: string; workflowId: string; organizationId: string; makeDefault?: boolean },
  ) {
    return this.workflowsService.attachSpaceWorkflow(data);
  }

  @MessagePattern({ cmd: 'detach_space_workflow' })
  detachSpaceWorkflow(@Payload() data: { spaceId: string; workflowId: string; organizationId: string }) {
    return this.workflowsService.detachSpaceWorkflow(data);
  }

  @MessagePattern({ cmd: 'share_workflow_with_org' })
  shareWithOrganization(@Payload() data: { workflowId: string; organizationId: string }) {
    return this.workflowsService.shareWithOrganization(data);
  }

  @MessagePattern({ cmd: 'fork_workflow_for_space' })
  forkForSpace(@Payload() data: { workflowId: string; spaceId: string; organizationId: string }) {
    return this.workflowsService.forkForSpace(data);
  }

  @MessagePattern({ cmd: 'set_space_default_workflow' })
  setSpaceDefaultWorkflow(@Payload() data: { spaceId: string; workflowId: string; organizationId: string }) {
    return this.workflowsService.setSpaceDefaultWorkflow(data);
  }

  // ── The shared task-type library ────────────────────────────────────────────
  //
  // `list_workflow_templates` / `use_workflow_template` are what a TENANT may
  // reach and only ever touch published rows. The `curate_*` patterns are the
  // platform's, reachable only behind the platform-staff guard at the gateway.

  @MessagePattern({ cmd: 'list_workflow_templates' })
  listTemplates(@Payload() data: { organizationId: string }) {
    return this.library.listTemplates(data);
  }

  @MessagePattern({ cmd: 'use_workflow_template' })
  useTemplate(
    @Payload()
    data: {
      templateId: string;
      organizationId: string;
      name?: string;
      isDefault?: boolean;
      spaceId?: string;
      shareWithOrganization?: boolean;
    },
  ) {
    return this.library.useTemplate(data);
  }

  @MessagePattern({ cmd: 'submit_workflow_to_library' })
  submitToLibrary(@Payload() data: { workflowId: string; organizationId: string; note?: string }) {
    return this.library.submitToLibrary(data);
  }

  @MessagePattern({ cmd: 'curate_list_workflow_templates' })
  curateList() {
    return this.library.curateList();
  }

  @MessagePattern({ cmd: 'curate_upsert_workflow_template' })
  curateUpsert(@Payload() data: any) {
    return this.library.curateUpsert(data);
  }

  @MessagePattern({ cmd: 'curate_publish_workflow_template' })
  curatePublish(@Payload() data: { id: string; isPublished: boolean }) {
    return this.library.curateSetPublished(data);
  }

  @MessagePattern({ cmd: 'curate_delete_workflow_template' })
  curateDelete(@Payload() data: { id: string }) {
    return this.library.curateDelete(data);
  }

  @MessagePattern({ cmd: 'curate_import_workflow_template' })
  curateImport(@Payload() data: { workflowId: string; slug?: string; industry?: string | null }) {
    return this.library.curateImportFromOrg(data);
  }
}
