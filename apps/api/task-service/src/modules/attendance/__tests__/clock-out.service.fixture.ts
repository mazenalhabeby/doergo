import { combinedServices } from '../../../common/testing/combined-services';
import { ClockOutService } from '../clock-out.service';
import { ClockOutAlertsService } from '../clock-out-alerts.service';
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
    // ShiftCloseBase's seven required arguments, the alerts (built from the same doubles), then the two optional ones.
    new (ClockOutService as unknown as new (...a: unknown[]) => object)(
      ...Array.from({ length: 7 }, (_, i) => args[i]),
      new (ClockOutAlertsService as unknown as new (...a: unknown[]) => object)(args[0], args[1], args[2], args[4]),
      args[7],
      args[8],
    ),
    new (DecidedCloseService as unknown as new (...a: unknown[]) => object)(...args),
    new (ShiftCloseSweepService as unknown as new (...a: unknown[]) => object)(...args),
  );
}
