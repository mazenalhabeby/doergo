import { combinedServices } from '../../../common/testing/combined-services';
import { EmployeeDetailService } from '../employee-detail.service';
import { EmployeeStatsService } from '../employee-stats.service';

/** The public face of a class (an intersection of classes with private members is `never`). */
type Public<T> = { [K in keyof T]: T[K] };

/** Every service split out of EmployeeDetailService, as ONE object — the tests were written against the single class. */
export type EmployeeDetailServiceParts = Public<EmployeeDetailService> & Public<EmployeeStatsService>;

export function employeeDetailParts(...args: unknown[]): EmployeeDetailServiceParts {
  const employeeDetailService = new (EmployeeDetailService as unknown as new (...a: unknown[]) => object)(...args) as any;
  const employeeStatsService = new (EmployeeStatsService as unknown as new (...a: unknown[]) => object)(...args) as any;
  employeeDetailService.stats = employeeStatsService; // @Inject(EmployeeStatsService) property — Nest fills it, a test must
  return combinedServices<EmployeeDetailServiceParts>(employeeDetailService, employeeStatsService);
}

/** The same, from a Nest test module that registered them all. */
export function employeeDetailPartsOf(mod: { get<T>(cls: new (...a: never[]) => T): T }): EmployeeDetailServiceParts {
  // Only the services this test module registered — a test that provides one of them still works.
  const parts = [EmployeeDetailService, EmployeeStatsService].flatMap((C) => {
    try { return [mod.get(C as unknown as new (...a: never[]) => object)]; } catch { return []; }
  });
  return combinedServices<EmployeeDetailServiceParts>(...parts);
}
