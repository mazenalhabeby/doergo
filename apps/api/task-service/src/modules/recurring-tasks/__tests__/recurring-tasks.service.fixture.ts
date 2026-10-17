import { combinedServices } from '../../../common/testing/combined-services';
import { RecurringTasksService } from '../recurring-tasks.service';
import { RecurringRunnerService } from '../recurring-runner.service';

/** The public face of a class (an intersection of classes with private members is `never`). */
type Public<T> = { [K in keyof T]: T[K] };

/** Every service split out of RecurringTasksService, as ONE object — the tests were written against the single class. */
export type RecurringTasksServiceParts = Public<RecurringTasksService> & Public<RecurringRunnerService>;

export function recurringParts(...args: unknown[]): RecurringTasksServiceParts {
  return combinedServices<RecurringTasksServiceParts>(
    new (RecurringTasksService as unknown as new (...a: unknown[]) => object)(...args),
    new (RecurringRunnerService as unknown as new (...a: unknown[]) => object)(...args),
  );
}

/** The same, from a Nest test module that registered them all. */
export function recurringPartsOf(mod: { get<T>(cls: new (...a: never[]) => T): T }): RecurringTasksServiceParts {
  // Only the services this test module registered — a test that provides one of them still works.
  const parts = [RecurringTasksService, RecurringRunnerService].flatMap((C) => {
    try { return [mod.get(C as unknown as new (...a: never[]) => object)]; } catch { return []; }
  });
  return combinedServices<RecurringTasksServiceParts>(...parts);
}
