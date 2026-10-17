import { combinedServices } from '../../../common/testing/combined-services';
import { ShiftIssuesService } from '../shift-issues.service';
import { ShiftIssueActionsService } from '../shift-issue-actions.service';

/** The public face of a class (an intersection of classes with private members is `never`). */
type Public<T> = { [K in keyof T]: T[K] };

/** Every service split out of ShiftIssuesService, as ONE object — the tests were written against the single class. */
export type ShiftIssuesServiceParts = Public<ShiftIssuesService> & Public<ShiftIssueActionsService>;

export function shiftIssuesParts(...args: unknown[]): ShiftIssuesServiceParts {
  const shiftIssuesService = new (ShiftIssuesService as unknown as new (...a: unknown[]) => object)(...args) as any;
  const shiftIssueActionsService = new (ShiftIssueActionsService as unknown as new (...a: unknown[]) => object)(...args) as any;
  return combinedServices<ShiftIssuesServiceParts>(shiftIssuesService, shiftIssueActionsService);
}

/** The same, from a Nest test module that registered them all. */
export function shiftIssuesPartsOf(mod: { get<T>(cls: new (...a: never[]) => T): T }): ShiftIssuesServiceParts {
  // Only the services this test module registered — a test that provides one of them still works.
  const parts = [ShiftIssuesService, ShiftIssueActionsService].flatMap((C) => {
    try { return [mod.get(C as unknown as new (...a: never[]) => object)]; } catch { return []; }
  });
  return combinedServices<ShiftIssuesServiceParts>(...parts);
}
