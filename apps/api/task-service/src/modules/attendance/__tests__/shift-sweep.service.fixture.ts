import { combinedServices } from '../../../common/testing/combined-services';
import { ShiftSweepService } from '../shift-sweep.service';
import { ShiftReminderSweepService } from '../shift-reminder-sweep.service';
import { ShiftInstancesService } from '../shift-instances.service';

/** The public face of a class (an intersection of classes with private members is `never`). */
type Public<T> = { [K in keyof T]: T[K] };

/** Every service split out of ShiftSweepService, as ONE object — the tests were written against the single class. */
export type ShiftSweepServiceParts = Public<ShiftSweepService> & Public<ShiftReminderSweepService> & Public<ShiftInstancesService>;

export function shiftSweepParts(...args: unknown[]): ShiftSweepServiceParts {
  return combinedServices<ShiftSweepServiceParts>(
    new (ShiftSweepService as unknown as new (...a: unknown[]) => object)(...args),
    new (ShiftReminderSweepService as unknown as new (...a: unknown[]) => object)(args[0], args[1], args[3], args[4]),
    new (ShiftInstancesService as unknown as new (...a: unknown[]) => object)(args[0], args[2]),
  );
}
