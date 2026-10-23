import { combinedServices } from '../../../common/testing/combined-services';
import { ShiftIssuesService } from '../shift-issues.service';
import { ShiftIssueActionsService } from '../shift-issue-actions.service';
import { ShiftIssueFiles } from '../shift-issue-files.service';
import { ShiftIssueNotices } from '../shift-issue-notices.service';

/** The public face of a class (an intersection of classes with private members is `never`). */
type Public<T> = { [K in keyof T]: T[K] };

/** Every service split out of ShiftIssuesService, as ONE object — the tests were written against the single class. */
export type ShiftIssuesServiceParts = Public<ShiftIssuesService> & Public<ShiftIssueActionsService>;

/** Both services over the same collaborators, built from (prisma, routing, notificationClient, store, media). */
export function shiftIssuesParts(
  prisma: any,
  routing: any,
  notificationClient: any,
  store: any,
  media: any,
): ShiftIssuesServiceParts {
  const files = new ShiftIssueFiles(store, media);
  const notices = new ShiftIssueNotices(prisma, routing, notificationClient);
  const shiftIssuesService = new ShiftIssuesService(prisma, store, files, notices);
  const shiftIssueActionsService = new ShiftIssueActionsService(prisma, files, notices);
  return combinedServices<ShiftIssuesServiceParts>(shiftIssuesService, shiftIssueActionsService);
}
