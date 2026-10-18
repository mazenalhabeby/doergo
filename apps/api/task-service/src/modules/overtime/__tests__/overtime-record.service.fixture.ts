import { combinedServices } from '../../../common/testing/combined-services';
import { OvertimeRecordService } from '../overtime-record.service';
import { OvertimeSummaryService } from '../overtime-summary.service';

/** The public face of a class (an intersection of classes with private members is `never`). */
type Public<T> = { [K in keyof T]: T[K] };

/** Every service split out of OvertimeRecordService, as ONE object — the tests were written against the single class. */
export type OvertimeRecordServiceParts = Public<OvertimeRecordService> & Public<OvertimeSummaryService>;

export function overtimeRecordParts(...args: unknown[]): OvertimeRecordServiceParts {
  const overtimeRecordService = new (OvertimeRecordService as unknown as new (...a: unknown[]) => object)(...args) as any;
  const overtimeSummaryService = new (OvertimeSummaryService as unknown as new (...a: unknown[]) => object)(...args) as any;
  return combinedServices<OvertimeRecordServiceParts>(overtimeRecordService, overtimeSummaryService);
}
