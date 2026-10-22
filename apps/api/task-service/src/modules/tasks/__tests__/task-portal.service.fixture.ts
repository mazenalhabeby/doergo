import { combinedServices } from '../../../common/testing/combined-services';
import { TaskPortalService } from '../records/task-portal.service';
import { TaskTriageService } from '../records/task-triage.service';

/** The public face of a class (an intersection of classes with private members is `never`). */
type Public<T> = { [K in keyof T]: T[K] };

/** Every service split out of TaskPortalService, as ONE object — the tests were written against the single class. */
export type TaskPortalServiceParts = Public<TaskPortalService> & Public<TaskTriageService>;

export function taskPortalParts(...args: unknown[]): TaskPortalServiceParts {
  const taskPortalService = new (TaskPortalService as unknown as new (...a: unknown[]) => object)(...args) as any;
  const taskTriageService = new (TaskTriageService as unknown as new (...a: unknown[]) => object)(...args) as any;
  return combinedServices<TaskPortalServiceParts>(taskPortalService, taskTriageService);
}
