import { combinedServices } from '../../../common/testing/combined-services';
import { EventsService } from '../events.service';
import { EventAnswersService } from '../event-answers.service';
import { EventReadService } from '../event-read.service';
import { AvailabilityService } from '../availability.service';

/** The public face of a class (an intersection of classes with private members is `never`). */
type Public<T> = { [K in keyof T]: T[K] };

/** Every service split out of EventsService, as ONE object — the tests were written against the single class. */
export type EventsServiceParts = Public<EventsService> &
  Public<EventAnswersService> &
  Public<EventReadService> &
  Public<AvailabilityService>;

export function eventServices(...args: unknown[]): EventsServiceParts {
  return combinedServices<EventsServiceParts>(
    new (EventsService as unknown as new (...a: unknown[]) => object)(...args),
    new (EventAnswersService as unknown as new (...a: unknown[]) => object)(...args),
    new (EventReadService as unknown as new (...a: unknown[]) => object)(...args),
    new (AvailabilityService as unknown as new (...a: unknown[]) => object)(...args),
  );
}

/** The same, from a Nest test module that registered them all. */
export function eventServicesOf(mod: { get<T>(cls: new (...a: never[]) => T): T }): EventsServiceParts {
  // Only the services this test module registered — a test that provides one of them still works.
  const parts = [EventsService, EventAnswersService, EventReadService, AvailabilityService].flatMap((C) => {
    try {
      return [mod.get(C as unknown as new (...a: never[]) => object)];
    } catch {
      return [];
    }
  });
  return combinedServices<EventsServiceParts>(...parts);
}
