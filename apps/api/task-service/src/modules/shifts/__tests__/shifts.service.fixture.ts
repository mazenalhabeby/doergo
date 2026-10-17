import { combinedServices } from '../../../common/testing/combined-services';
import { ShiftsService } from '../shifts.service';
import { ShiftAssignmentsService } from '../shift-assignments.service';
import { RotaService } from '../rota.service';

/** The public face of a class (an intersection of classes with private members is `never`). */
type Public<T> = { [K in keyof T]: T[K] };

/** Every service split out of ShiftsService, as ONE object — the tests were written against the single class. */
export type ShiftsServiceParts = Public<ShiftsService> & Public<ShiftAssignmentsService> & Public<RotaService>;

export function shiftServices(...args: unknown[]): ShiftsServiceParts {
  return combinedServices<ShiftsServiceParts>(
    new (ShiftsService as unknown as new (...a: unknown[]) => object)(...args),
    new (ShiftAssignmentsService as unknown as new (...a: unknown[]) => object)(...args),
    new (RotaService as unknown as new (...a: unknown[]) => object)(...args),
  );
}

/** The same, from a Nest test module that registered them all. */
export function shiftServicesOf(mod: { get<T>(cls: new (...a: never[]) => T): T }): ShiftsServiceParts {
  // Only the services this test module registered — a test that provides one of them still works.
  const parts = [ShiftsService, ShiftAssignmentsService, RotaService].flatMap((C) => {
    try {
      return [mod.get(C as unknown as new (...a: never[]) => object)];
    } catch {
      return [];
    }
  });
  return combinedServices<ShiftsServiceParts>(...parts);
}
