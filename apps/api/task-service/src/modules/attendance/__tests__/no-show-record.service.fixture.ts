import { combinedServices } from '../../../common/testing/combined-services';
import { NoShowRecordService } from '../no-show-record.service';
import { NoShowSummaryService } from '../no-show-summary.service';

/** The public face of a class (an intersection of classes with private members is `never`). */
type Public<T> = { [K in keyof T]: T[K] };

/** Every service split out of NoShowRecordService, as ONE object — the tests were written against the single class. */
export type NoShowRecordServiceParts = Public<NoShowRecordService> & Public<NoShowSummaryService>;

export function noShowRecordParts(...args: unknown[]): NoShowRecordServiceParts {
  const noShowRecordService = new (NoShowRecordService as unknown as new (...a: unknown[]) => object)(...args) as any;
  const noShowSummaryService = new (NoShowSummaryService as unknown as new (...a: unknown[]) => object)(...args) as any;
  return combinedServices<NoShowRecordServiceParts>(noShowRecordService, noShowSummaryService);
}

/** The same, from a Nest test module that registered them all. */
export function noShowRecordPartsOf(mod: { get<T>(cls: new (...a: never[]) => T): T }): NoShowRecordServiceParts {
  // Only the services this test module registered — a test that provides one of them still works.
  const parts = [NoShowRecordService, NoShowSummaryService].flatMap((C) => {
    try { return [mod.get(C as unknown as new (...a: never[]) => object)]; } catch { return []; }
  });
  return combinedServices<NoShowRecordServiceParts>(...parts);
}
