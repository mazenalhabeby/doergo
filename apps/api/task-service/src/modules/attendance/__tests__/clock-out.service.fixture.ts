import { combinedServices } from '../../../common/testing/combined-services';
import { ClockOutService } from '../clock-out.service';
import { DecidedCloseService } from '../decided-close.service';
import { ShiftCloseSweepService } from '../shift-close-sweep.service';

/** The public face of a class (an intersection of classes with private members is `never`). */
type Public<T> = { [K in keyof T]: T[K] };

/** Every service split out of ClockOutService, as ONE object — the tests were written against the single class. */
export type ClockOutServiceParts = Public<ClockOutService> &
  Public<DecidedCloseService> &
  Public<ShiftCloseSweepService>;

export function clockOutServices(...args: unknown[]): ClockOutServiceParts {
  return combinedServices<ClockOutServiceParts>(
    new (ClockOutService as unknown as new (...a: unknown[]) => object)(...args),
    new (DecidedCloseService as unknown as new (...a: unknown[]) => object)(...args),
    new (ShiftCloseSweepService as unknown as new (...a: unknown[]) => object)(...args),
  );
}

/** The same, from a Nest test module that registered them all. */
export function clockOutServicesOf(mod: { get<T>(cls: new (...a: never[]) => T): T }): ClockOutServiceParts {
  // Only the services this test module registered — a test that provides one of them still works.
  const parts = [ClockOutService, DecidedCloseService, ShiftCloseSweepService].flatMap((C) => {
    try {
      return [mod.get(C as unknown as new (...a: never[]) => object)];
    } catch {
      return [];
    }
  });
  return combinedServices<ClockOutServiceParts>(...parts);
}
