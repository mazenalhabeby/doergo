import { combinedServices } from '../../../common/testing/combined-services';
import { NoShowRecordService } from '../no-shows/no-show-record.service';
import { NoShowSummaryService } from '../no-shows/no-show-summary.service';

/** The public face of a class (an intersection of classes with private members is `never`). */
type Public<T> = { [K in keyof T]: T[K] };

/** Every service split out of NoShowRecordService, as ONE object — the tests were written against the single class. */
export type NoShowRecordServiceParts = Public<NoShowRecordService> & Public<NoShowSummaryService>;

export function noShowRecordParts(...args: unknown[]): NoShowRecordServiceParts {
  const noShowRecordService = new (NoShowRecordService as unknown as new (...a: unknown[]) => object)(...args) as any;
  const noShowSummaryService = new (NoShowSummaryService as unknown as new (...a: unknown[]) => object)(...args) as any;
  return combinedServices<NoShowRecordServiceParts>(noShowRecordService, noShowSummaryService);
}
