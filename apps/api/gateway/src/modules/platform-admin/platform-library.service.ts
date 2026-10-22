import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { BaseGatewayService, SERVICE_NAMES } from '@hbcfield/shared';
import {
  pattern,
  curateDeleteWorkflowTemplate,
  curateImportWorkflowTemplate,
  curateListWorkflowTemplates,
  curatePublishWorkflowTemplate,
  curateUpsertWorkflowTemplate,
  type RpcRequest,
} from '@hbcfield/shared/microservices';

/** Gateway → task-service proxy for curating the shared task-type library. */
@Injectable()
export class PlatformLibraryService extends BaseGatewayService {
  constructor(@Inject(SERVICE_NAMES.TASK) taskClient: ClientProxy) {
    super(taskClient, PlatformLibraryService.name);
  }
  list() {
    return this.send(pattern(curateListWorkflowTemplates), {} satisfies RpcRequest<typeof curateListWorkflowTemplates>);
  }
  upsert(data: RpcRequest<typeof curateUpsertWorkflowTemplate>) {
    return this.send(pattern(curateUpsertWorkflowTemplate), data);
  }
  setPublished(data: { id: string; isPublished: boolean }) {
    return this.send(
      pattern(curatePublishWorkflowTemplate),
      data satisfies RpcRequest<typeof curatePublishWorkflowTemplate>,
    );
  }
  remove(data: { id: string }) {
    return this.send(
      pattern(curateDeleteWorkflowTemplate),
      data satisfies RpcRequest<typeof curateDeleteWorkflowTemplate>,
    );
  }
  importFromOrg(data: { workflowId: string; slug?: string; industry?: string | null }) {
    return this.send(
      pattern(curateImportWorkflowTemplate),
      data satisfies RpcRequest<typeof curateImportWorkflowTemplate>,
    );
  }
}
