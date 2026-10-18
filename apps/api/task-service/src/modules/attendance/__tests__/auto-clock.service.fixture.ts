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
