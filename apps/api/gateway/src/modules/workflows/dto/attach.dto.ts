import { OptBoolean } from '../../../common/dto/body-fields';

/** POST /workflows/spaces/:spaceId/:workflowId — the web sends { makeDefault }. */
export class AttachSpaceWorkflowDto {
  @OptBoolean() makeDefault?: boolean;
}
