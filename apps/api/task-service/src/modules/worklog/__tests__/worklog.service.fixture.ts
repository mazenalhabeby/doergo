import { combinedServices } from '../../../common/testing/combined-services';
import { WorklogService } from '../worklog.service';
import { WorklogAttachmentsService } from '../worklog-attachments.service';
import { WorklogAccess } from '../worklog-access.service';

/** The public face of a class (an intersection of classes with private members is `never`). */
type Public<T> = { [K in keyof T]: T[K] };

/** Every service split out of WorklogService, as ONE object — the tests were written against the single class. */
export type WorklogServiceParts = Public<WorklogService> & Public<WorklogAttachmentsService>;

/** `(prisma, store, media)` — the session/ownership reads are built from the same prisma. */
export function worklogParts(...deps: unknown[]): WorklogServiceParts {
  const access = new WorklogAccess(deps[0] as never);
  const args = [...deps, access];
  const worklogService = new (WorklogService as unknown as new (...a: unknown[]) => object)(...args) as any;
  const worklogAttachmentsService = new (WorklogAttachmentsService as unknown as new (...a: unknown[]) => object)(
    ...args,
  ) as any;
  return combinedServices<WorklogServiceParts>(worklogService, worklogAttachmentsService);
}
