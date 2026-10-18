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
