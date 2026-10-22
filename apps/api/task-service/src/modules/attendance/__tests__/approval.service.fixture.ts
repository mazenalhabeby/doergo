import { combinedServices } from '../../../common/testing/combined-services';
import { ApprovalService } from '../entries/approval.service';
import { EntryEditService } from '../entries/entry-edit.service';
import { EntryRecordService } from '../entries/entry-record.service';
import { ManualEntriesService } from '../entries/manual-entries.service';

/** The public face of a class (an intersection of classes with private members is `never`). */
type Public<T> = { [K in keyof T]: T[K] };

/** Every service split out of ApprovalService, as ONE object — the tests were written against the single class. */
export type ApprovalServiceParts = Public<ApprovalService> &
  Public<EntryEditService> &
  Public<EntryRecordService> &
  Public<ManualEntriesService>;

export function entryServices(...args: unknown[]): ApprovalServiceParts {
  return combinedServices<ApprovalServiceParts>(
    new (ApprovalService as unknown as new (...a: unknown[]) => object)(...args),
    new (EntryEditService as unknown as new (...a: unknown[]) => object)(...args),
    new (EntryRecordService as unknown as new (...a: unknown[]) => object)(...args),
    new (ManualEntriesService as unknown as new (...a: unknown[]) => object)(...args),
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
