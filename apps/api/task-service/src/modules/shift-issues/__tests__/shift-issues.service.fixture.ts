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
