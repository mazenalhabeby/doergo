import { combinedServices } from '../../../common/testing/combined-services';
import { TaskPortalService } from '../task-portal.service';
import { TaskTriageService } from '../task-triage.service';

/** The public face of a class (an intersection of classes with private members is `never`). */
type Public<T> = { [K in keyof T]: T[K] };

/** Every service split out of TaskPortalService, as ONE object — the tests were written against the single class. */
export type TaskPortalServiceParts = Public<TaskPortalService> & Public<TaskTriageService>;

export function taskPortalParts(...args: unknown[]): TaskPortalServiceParts {
  const taskPortalService = new (TaskPortalService as unknown as new (...a: unknown[]) => object)(...args) as any;
  const taskTriageService = new (TaskTriageService as unknown as new (...a: unknown[]) => object)(...args) as any;
  return combinedServices<TaskPortalServiceParts>(taskPortalService, taskTriageService);
}

/** The same, from a Nest test module that registered them all. */
export function taskPortalPartsOf(mod: { get<T>(cls: new (...a: never[]) => T): T }): TaskPortalServiceParts {
  // Only the services this test module registered — a test that provides one of them still works.
  const parts = [TaskPortalService, TaskTriageService].flatMap((C) => {
    try { return [mod.get(C as unknown as new (...a: never[]) => object)]; } catch { return []; }
  });
  return combinedServices<TaskPortalServiceParts>(...parts);
}
