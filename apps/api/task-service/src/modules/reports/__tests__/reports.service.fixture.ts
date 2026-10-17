import { combinedServices } from '../../../common/testing/combined-services';
import { ReportsService } from '../reports.service';
import { ReportReadService } from '../report-read.service';
import { ReportPartsService } from '../report-parts.service';
import { ReportAttachmentsService } from '../report-attachments.service';

/** The public face of a class (an intersection of classes with private members is `never`). */
type Public<T> = { [K in keyof T]: T[K] };

/** Every service split out of ReportsService, as ONE object — the tests were written against the single class. */
export type ReportsServiceParts = Public<ReportsService> &
  Public<ReportReadService> &
  Public<ReportPartsService> &
  Public<ReportAttachmentsService>;

export function reportServices(...args: unknown[]): ReportsServiceParts {
  return combinedServices<ReportsServiceParts>(
    new (ReportsService as unknown as new (...a: unknown[]) => object)(...args),
    new (ReportReadService as unknown as new (...a: unknown[]) => object)(...args),
    new (ReportPartsService as unknown as new (...a: unknown[]) => object)(...args),
    new (ReportAttachmentsService as unknown as new (...a: unknown[]) => object)(...args),
  );
}

/** The same, from a Nest test module that registered them all. */
export function reportServicesOf(mod: { get<T>(cls: new (...a: never[]) => T): T }): ReportsServiceParts {
  // Only the services this test module registered — a test that provides one of them still works.
  const parts = [ReportsService, ReportReadService, ReportPartsService, ReportAttachmentsService].flatMap((C) => {
    try {
      return [mod.get(C as unknown as new (...a: never[]) => object)];
    } catch {
      return [];
    }
  });
  return combinedServices<ReportsServiceParts>(...parts);
}
