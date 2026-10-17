import { combinedServices } from '../../../common/testing/combined-services';
import { WorklogService } from '../worklog.service';
import { WorklogAttachmentsService } from '../worklog-attachments.service';

/** The public face of a class (an intersection of classes with private members is `never`). */
type Public<T> = { [K in keyof T]: T[K] };

/** Every service split out of WorklogService, as ONE object — the tests were written against the single class. */
export type WorklogServiceParts = Public<WorklogService> & Public<WorklogAttachmentsService>;

export function worklogParts(...args: unknown[]): WorklogServiceParts {
  const worklogService = new (WorklogService as unknown as new (...a: unknown[]) => object)(...args) as any;
  const worklogAttachmentsService = new (WorklogAttachmentsService as unknown as new (...a: unknown[]) => object)(...args) as any;
  return combinedServices<WorklogServiceParts>(worklogService, worklogAttachmentsService);
}

/** The same, from a Nest test module that registered them all. */
export function worklogPartsOf(mod: { get<T>(cls: new (...a: never[]) => T): T }): WorklogServiceParts {
  // Only the services this test module registered — a test that provides one of them still works.
  const parts = [WorklogService, WorklogAttachmentsService].flatMap((C) => {
    try { return [mod.get(C as unknown as new (...a: never[]) => object)]; } catch { return []; }
  });
  return combinedServices<WorklogServiceParts>(...parts);
}
