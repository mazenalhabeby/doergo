import { combinedServices } from '../../../common/testing/combined-services';
import { AnalyticsService } from '../analytics.service';
import { SavedReportsService } from '../saved-reports.service';

/** The public face of a class (an intersection of classes with private members is `never`). */
type Public<T> = { [K in keyof T]: T[K] };

/** Every service split out of AnalyticsService, as ONE object — the tests were written against the single class. */
export type AnalyticsServiceParts = Public<AnalyticsService> & Public<SavedReportsService>;

export function analyticsParts(...args: unknown[]): AnalyticsServiceParts {
  const analyticsService = new (AnalyticsService as unknown as new (...a: unknown[]) => object)(...args) as any;
  const savedReportsService = new (SavedReportsService as unknown as new (...a: unknown[]) => object)(...args) as any;
  return combinedServices<AnalyticsServiceParts>(analyticsService, savedReportsService);
}

/** The same, from a Nest test module that registered them all. */
export function analyticsPartsOf(mod: { get<T>(cls: new (...a: never[]) => T): T }): AnalyticsServiceParts {
  // Only the services this test module registered — a test that provides one of them still works.
  const parts = [AnalyticsService, SavedReportsService].flatMap((C) => {
    try { return [mod.get(C as unknown as new (...a: never[]) => object)]; } catch { return []; }
  });
  return combinedServices<AnalyticsServiceParts>(...parts);
}
