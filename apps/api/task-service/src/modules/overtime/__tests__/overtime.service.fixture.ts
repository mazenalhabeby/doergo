import { combinedServices } from '../../../common/testing/combined-services';
import { OvertimeService } from '../overtime.service';
import { OvertimeDecisionService } from '../overtime-decision.service';

/** The public face of a class (an intersection of classes with private members is `never`). */
type Public<T> = { [K in keyof T]: T[K] };

/** Every service split out of OvertimeService, as ONE object — the tests were written against the single class. */
export type OvertimeServiceParts = Public<OvertimeService> & Public<OvertimeDecisionService>;

export function overtimeServices(...args: unknown[]): OvertimeServiceParts {
  return combinedServices<OvertimeServiceParts>(
    new (OvertimeService as unknown as new (...a: unknown[]) => object)(...args),
    new (OvertimeDecisionService as unknown as new (...a: unknown[]) => object)(...args),
  );
}

/** The same, from a Nest test module that registered them all. */
export function overtimeServicesOf(mod: { get<T>(cls: new (...a: never[]) => T): T }): OvertimeServiceParts {
  // Only the services this test module registered — a test that provides one of them still works.
  const parts = [OvertimeService, OvertimeDecisionService].flatMap((C) => {
    try {
      return [mod.get(C as unknown as new (...a: never[]) => object)];
    } catch {
      return [];
    }
  });
  return combinedServices<OvertimeServiceParts>(...parts);
}
