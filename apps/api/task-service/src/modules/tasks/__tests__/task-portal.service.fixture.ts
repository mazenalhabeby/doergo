import { noOfficeRules } from '../../approvals/__tests__/no-office-rules';
import { combinedServices } from '../../../common/testing/combined-services';
import { TaskPortalService } from '../records/task-portal.service';
import { TaskTriageService } from '../records/task-triage.service';

/** The public face of a class (an intersection of classes with private members is `never`). */
type Public<T> = { [K in keyof T]: T[K] };

/** Every service split out of TaskPortalService, as ONE object — the tests were written against the single class. */
export type TaskPortalServiceParts = Public<TaskPortalService> & Public<TaskTriageService>;

/** Takes the dependencies in the old shared order: prisma, notifications, media, support, assignment. */
export function taskPortalParts(...args: unknown[]): TaskPortalServiceParts {
  const [prisma, notificationClient, media, support, assignment] = args as any[];
  const taskPortalService = new TaskPortalService(prisma, media);
  const taskTriageService = new TaskTriageService(prisma, notificationClient, support, assignment, noOfficeRules());
  return combinedServices<TaskPortalServiceParts>(taskPortalService, taskTriageService);
}
