import { noOfficeRules } from '../../approvals/__tests__/no-office-rules';
import { combinedServices } from '../../../common/testing/combined-services';
import { ApprovalService } from '../entries/approval.service';
import { EntryEditService } from '../entries/entry-edit.service';
import { EntryRecordService } from '../entries/entry-record.service';
import { ManualEntriesService } from '../entries/manual-entries.service';
import { EntryChangeLog } from '../entries/entry-change-log';

/** The public face of a class (an intersection of classes with private members is `never`). */
type Public<T> = { [K in keyof T]: T[K] };

/** Every service split out of ApprovalService, as ONE object — the tests were written against the single class. */
export type ApprovalServiceParts = Public<ApprovalService> &
  Public<EntryEditService> &
  Public<EntryRecordService> &
  Public<ManualEntriesService>;

type Ctor = new (...a: unknown[]) => object;

/**
 * Built by hand, in the order the old shared constructor took them — each service is
 * handed the collaborators it actually uses, all sharing ONE change log.
 */
export function entryServices(
  prisma?: unknown,
  countedTime?: unknown,
  notificationClient?: unknown,
  rematch?: unknown,
  jobPause?: unknown,
  noShowSettle?: unknown,
  officeRules?: unknown,
): ApprovalServiceParts {
  const changes = new EntryChangeLog(prisma as never, notificationClient as never);
  const rules = officeRules ?? noOfficeRules();
  return combinedServices<ApprovalServiceParts>(
    new (ApprovalService as unknown as Ctor)(prisma, changes, notificationClient, rules),
    new (EntryEditService as unknown as Ctor)(prisma, countedTime, changes, rules, rematch, jobPause),
    new (EntryRecordService as unknown as Ctor)(prisma, changes),
    new (ManualEntriesService as unknown as Ctor)(prisma, changes, rules, noShowSettle),
  );
}

/** The same, from a Nest test module that registered them all. */
export function entryServicesOf(mod: { get<T>(cls: new (...a: never[]) => T): T }): ApprovalServiceParts {
  // Only the services this test module registered — a test that provides one of them still works.
  const parts = [ApprovalService, EntryEditService, EntryRecordService, ManualEntriesService].flatMap((C) => {
    try {
      return [mod.get(C as unknown as new (...a: never[]) => object)];
    } catch {
      return [];
    }
  });
  return combinedServices<ApprovalServiceParts>(...parts);
}
