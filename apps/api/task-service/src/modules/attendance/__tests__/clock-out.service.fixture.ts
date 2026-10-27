import { combinedServices } from '../../../common/testing/combined-services';
import { ClockOutService } from '../clock-out/clock-out.service';
import { ClockOutAlertsService } from '../clock-out/clock-out-alerts.service';
import { DecidedCloseService } from '../clock-out/decided-close.service';
import { ShiftCloseSweepService } from '../clock-out/shift-close-sweep.service';
import { ShiftCloser } from '../clock-out/shift-closer.service';
import { noOfficeRules } from '../../approvals/__tests__/no-office-rules';

/** The public face of a class (an intersection of classes with private members is `never`). */
type Public<T> = { [K in keyof T]: T[K] };

/** Every service split out of ClockOutService, as ONE object — the tests were written against the single class. */
export type ClockOutServiceParts = Public<ClockOutService> &
  Public<DecidedCloseService> &
  Public<ShiftCloseSweepService>;

type Ctor = new (...a: unknown[]) => object;

/**
 * Built by hand from the arguments the old shared constructor took, in its order:
 * (prisma, notificationClient, notificationRouting, countedTime, routing, geocoder,
 * extraTime, jobPause?, autoClock?) — each service gets what it uses, all closing
 * through ONE ShiftCloser.
 */
export function clockOutServices(...args: unknown[]): ClockOutServiceParts {
  const [
    prisma,
    notificationClient,
    notificationRouting,
    countedTime,
    routing,
    geocoder,
    extraTime,
    jobPause,
    autoClock,
  ] = args;
  const closer = new (ShiftCloser as unknown as Ctor)(
    prisma,
    notificationClient,
    notificationRouting,
    countedTime,
    // Office rules: none apply in these tests (a running shift changed by hand is judged at the close).
    noOfficeRules(),
    jobPause,
    autoClock,
  );
  const alerts = new (ClockOutAlertsService as unknown as Ctor)(
    prisma,
    notificationClient,
    notificationRouting,
    routing,
  );
  return combinedServices<ClockOutServiceParts>(
    new (ClockOutService as unknown as Ctor)(prisma, closer, geocoder, extraTime, alerts, autoClock),
    new (DecidedCloseService as unknown as Ctor)(prisma, closer),
    new (ShiftCloseSweepService as unknown as Ctor)(prisma, closer, autoClock),
  );
}
