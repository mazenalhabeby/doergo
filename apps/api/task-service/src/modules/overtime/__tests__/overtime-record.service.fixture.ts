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

/** The same, from a Nest test module that registered them all. */
export function overtimeRecordPartsOf(mod: { get<T>(cls: new (...a: never[]) => T): T }): OvertimeRecordServiceParts {
  // Only the services this test module registered — a test that provides one of them still works.
  const parts = [OvertimeRecordService, OvertimeSummaryService].flatMap((C) => {
    try { return [mod.get(C as unknown as new (...a: never[]) => object)]; } catch { return []; }
  });
  return combinedServices<OvertimeRecordServiceParts>(...parts);
}
