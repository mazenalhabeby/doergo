import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  pattern,
  addWorkflowStatus,
  attachSpaceWorkflow,
  createWorkflow,
  curateDeleteWorkflowTemplate,
  curateImportWorkflowTemplate,
  curateListWorkflowTemplates,
  curatePublishWorkflowTemplate,
  curateUpsertWorkflowTemplate,
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
import { WorkflowsService } from './workflows.service';
import { WorkflowLibraryService } from './workflow-library.service';
import { WorkflowStatusesService } from './workflow-statuses.service';
import { DefinitionOfDoneService } from './definition-of-done.service';
import { SpaceWorkflowsService } from './space-workflows.service';
import { WorkflowSharingService } from './workflow-sharing.service';
import { LibraryCurationService } from './library-curation.service';

/**
 * Microservice Controller for Status Workflow Operations
 *
 * Handles direct Redis microservice calls for workflow CRUD.
 */
@Controller()
export class WorkflowsController {
  constructor(
    private readonly workflowsService: WorkflowsService,
    private readonly sharing: WorkflowSharingService,
    private readonly spaceWorkflows: SpaceWorkflowsService,
    private readonly definitionOfDone: DefinitionOfDoneService,
    private readonly statuses: WorkflowStatusesService,
    private readonly library: WorkflowLibraryService,
    private readonly curation: LibraryCurationService,
  ) {}

  @MessagePattern(pattern(findAllWorkflows))
  async findAll(@Payload() data: RpcRequest<typeof findAllWorkflows>) {
    return this.workflowsService.findAll(data);
  }

  @MessagePattern(pattern(findWorkflow))
  async findOne(@Payload() data: RpcRequest<typeof findWorkflow>) {
    return this.workflowsService.findOne(data);
  }

  @MessagePattern(pattern(createWorkflow))
  async create(@Payload() data: RpcRequest<typeof createWorkflow>) {
    return this.workflowsService.create(data);
  }

  @MessagePattern(pattern(updateWorkflow))
  async update(@Payload() data: RpcRequest<typeof updateWorkflow>) {
    return this.workflowsService.update(data);
  }

  @MessagePattern(pattern(deleteWorkflow))
  async remove(@Payload() data: RpcRequest<typeof deleteWorkflow>) {
    return this.workflowsService.remove(data);
  }

  @MessagePattern(pattern(setDefaultWorkflow))
  async setDefault(@Payload() data: RpcRequest<typeof setDefaultWorkflow>) {
    return this.spaceWorkflows.setDefault(data);
  }

  @MessagePattern(pattern(addWorkflowStatus))
  async addStatus(@Payload() data: RpcRequest<typeof addWorkflowStatus>) {
    return this.statuses.addStatus(data);
  }

  @MessagePattern(pattern(updateWorkflowStatus))
  async updateStatus(@Payload() data: RpcRequest<typeof updateWorkflowStatus>) {
    return this.statuses.updateStatus(data);
  }

  @MessagePattern(pattern(deleteWorkflowStatus))
  async removeStatus(@Payload() data: RpcRequest<typeof deleteWorkflowStatus>) {
    return this.statuses.removeStatus(data);
  }

  @MessagePattern(pattern(reorderWorkflowStatuses))
  async reorderStatuses(@Payload() data: RpcRequest<typeof reorderWorkflowStatuses>) {
    return this.statuses.reorderStatuses(data);
  }

  // ==================== Definition of Done ====================

  @MessagePattern(pattern(getDefinitionOfDone))
  async getDefinitionOfDone(@Payload() data: RpcRequest<typeof getDefinitionOfDone>) {
    return this.definitionOfDone.getDefinitionOfDone(data);
  }

  @MessagePattern(pattern(upsertDefinitionOfDone))
  async upsertDefinitionOfDone(@Payload() data: RpcRequest<typeof upsertDefinitionOfDone>) {
    return this.definitionOfDone.upsertDefinitionOfDone(data);
  }

  @MessagePattern(pattern(deleteDefinitionOfDone))
  async removeDefinitionOfDone(@Payload() data: RpcRequest<typeof deleteDefinitionOfDone>) {
    return this.definitionOfDone.removeDefinitionOfDone(data);
  }
  // ── Which workflows a space offers ──────────────────────────────────────────

  @MessagePattern(pattern(listSpaceWorkflows))
  listSpaceWorkflows(@Payload() data: RpcRequest<typeof listSpaceWorkflows>) {
    return this.spaceWorkflows.listSpaceWorkflows(data);
  }

  @MessagePattern(pattern(attachSpaceWorkflow))
  attachSpaceWorkflow(@Payload() data: RpcRequest<typeof attachSpaceWorkflow>) {
    return this.spaceWorkflows.attachSpaceWorkflow(data);
  }

  @MessagePattern(pattern(detachSpaceWorkflow))
  detachSpaceWorkflow(@Payload() data: RpcRequest<typeof detachSpaceWorkflow>) {
    return this.spaceWorkflows.detachSpaceWorkflow(data);
  }

  @MessagePattern(pattern(shareWorkflowWithOrg))
  shareWithOrganization(@Payload() data: RpcRequest<typeof shareWorkflowWithOrg>) {
    return this.sharing.shareWithOrganization(data);
  }

  @MessagePattern(pattern(forkWorkflowForSpace))
  forkForSpace(@Payload() data: RpcRequest<typeof forkWorkflowForSpace>) {
    return this.sharing.forkForSpace(data);
  }

  @MessagePattern(pattern(setSpaceDefaultWorkflow))
  setSpaceDefaultWorkflow(@Payload() data: RpcRequest<typeof setSpaceDefaultWorkflow>) {
    return this.spaceWorkflows.setSpaceDefaultWorkflow(data);
  }

  // ── The shared task-type library ────────────────────────────────────────────
  //
  // `list_workflow_templates` / `use_workflow_template` are what a TENANT may
  // reach and only ever touch published rows. The `curate_*` patterns are the
  // platform's, reachable only behind the platform-staff guard at the gateway.

  @MessagePattern(pattern(listWorkflowTemplates))
  listTemplates(@Payload() data: RpcRequest<typeof listWorkflowTemplates>) {
    return this.library.listTemplates(data);
  }

  @MessagePattern(pattern(useWorkflowTemplate))
  useTemplate(
    @Payload()
    data: RpcRequest<typeof useWorkflowTemplate>,
  ) {
    return this.library.useTemplate(data);
  }

  @MessagePattern(pattern(submitWorkflowToLibrary))
  submitToLibrary(@Payload() data: RpcRequest<typeof submitWorkflowToLibrary>) {
    return this.library.submitToLibrary(data);
  }

  @MessagePattern(pattern(curateListWorkflowTemplates))
  curateList() {
    return this.curation.curateList();
  }

  @MessagePattern(pattern(curateUpsertWorkflowTemplate))
  curateUpsert(@Payload() data: RpcRequest<typeof curateUpsertWorkflowTemplate>) {
    return this.curation.curateUpsert(data);
  }

  @MessagePattern(pattern(curatePublishWorkflowTemplate))
  curatePublish(@Payload() data: RpcRequest<typeof curatePublishWorkflowTemplate>) {
    return this.curation.curateSetPublished(data);
  }

  @MessagePattern(pattern(curateDeleteWorkflowTemplate))
  curateDelete(@Payload() data: RpcRequest<typeof curateDeleteWorkflowTemplate>) {
    return this.curation.curateDelete(data);
  }

  @MessagePattern(pattern(curateImportWorkflowTemplate))
  curateImport(@Payload() data: RpcRequest<typeof curateImportWorkflowTemplate>) {
    return this.curation.curateImportFromOrg(data);
  }
}
