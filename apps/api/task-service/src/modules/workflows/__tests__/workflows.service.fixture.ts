import { combinedServices } from '../../../common/testing/combined-services';
import { WorkflowsService } from '../workflows.service';
import { WorkflowStatusesService } from '../workflow-statuses.service';
import { DefinitionOfDoneService } from '../definition-of-done.service';
import { SpaceWorkflowsService } from '../space-workflows.service';
import { WorkflowSharingService } from '../workflow-sharing.service';

/** The public face of a class (an intersection of classes with private members is `never`). */
type Public<T> = { [K in keyof T]: T[K] };

/** Every service split out of WorkflowsService, as ONE object — the tests were written against the single class. */
export type WorkflowsServiceParts = Public<WorkflowsService> &
  Public<WorkflowStatusesService> &
  Public<DefinitionOfDoneService> &
  Public<SpaceWorkflowsService> &
  Public<WorkflowSharingService>;

export function workflowServices(...args: unknown[]): WorkflowsServiceParts {
  return combinedServices<WorkflowsServiceParts>(
    new (WorkflowsService as unknown as new (...a: unknown[]) => object)(...args),
    new (WorkflowStatusesService as unknown as new (...a: unknown[]) => object)(...args),
    new (DefinitionOfDoneService as unknown as new (...a: unknown[]) => object)(...args),
    new (SpaceWorkflowsService as unknown as new (...a: unknown[]) => object)(...args),
    new (WorkflowSharingService as unknown as new (...a: unknown[]) => object)(...args),
  );
}

/** The same, from a Nest test module that registered them all. */
export function workflowServicesOf(mod: { get<T>(cls: new (...a: never[]) => T): T }): WorkflowsServiceParts {
  // Only the services this test module registered — a test that provides one of them still works.
  const parts = [
    WorkflowsService,
    WorkflowStatusesService,
    DefinitionOfDoneService,
    SpaceWorkflowsService,
    WorkflowSharingService,
  ].flatMap((C) => {
    try {
      return [mod.get(C as unknown as new (...a: never[]) => object)];
    } catch {
      return [];
    }
  });
  return combinedServices<WorkflowsServiceParts>(...parts);
}
