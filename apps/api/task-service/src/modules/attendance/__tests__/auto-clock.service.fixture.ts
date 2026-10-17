import { combinedServices } from '../../../common/testing/combined-services';
import { AutoClockService } from '../auto-clock.service';
import { AutoClockPlanService } from '../auto-clock-plan.service';
import { AutoClockUndoService } from '../auto-clock-undo.service';

/** The public face of a class (an intersection of classes with private members is `never`). */
type Public<T> = { [K in keyof T]: T[K] };

/** Every service split out of AutoClockService, as ONE object — the tests were written against the single class. */
export type AutoClockServiceParts = Public<AutoClockService> & Public<AutoClockPlanService> & Public<AutoClockUndoService>;

export function autoClockParts(...args: unknown[]): AutoClockServiceParts {
  const autoClockService = new (AutoClockService as unknown as new (...a: unknown[]) => object)(...args) as any;
  const autoClockPlanService = new (AutoClockPlanService as unknown as new (...a: unknown[]) => object)(...args) as any;
  const autoClockUndoService = new (AutoClockUndoService as unknown as new (...a: unknown[]) => object)(args[0], args[2]) as any;
  autoClockUndoService.autoClock = autoClockService; // @Inject(AutoClockService) property — Nest fills it, a test must
  return combinedServices<AutoClockServiceParts>(autoClockService, autoClockPlanService, autoClockUndoService);
}

/** The same, from a Nest test module that registered them all. */
export function autoClockPartsOf(mod: { get<T>(cls: new (...a: never[]) => T): T }): AutoClockServiceParts {
  // Only the services this test module registered — a test that provides one of them still works.
  const parts = [AutoClockService, AutoClockPlanService, AutoClockUndoService].flatMap((C) => {
    try { return [mod.get(C as unknown as new (...a: never[]) => object)]; } catch { return []; }
  });
  return combinedServices<AutoClockServiceParts>(...parts);
}
