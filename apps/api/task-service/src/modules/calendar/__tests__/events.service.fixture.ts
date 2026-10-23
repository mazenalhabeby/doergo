import { combinedServices } from '../../../common/testing/combined-services';
import { EventsService } from '../events.service';
import { EventAnswersService } from '../event-answers.service';
import { EventReadService } from '../event-read.service';
import { AvailabilityService } from '../availability.service';
import { EventViewService } from '../event-view.service';
import { EventPeopleService } from '../event-people.service';
import { EventNoticesService } from '../event-notices.service';
import { EventChecksService } from '../event-checks.service';
import { EventUpdateService } from '../event-update.service';

/** The public face of a class (an intersection of classes with private members is `never`). */
type Public<T> = { [K in keyof T]: T[K] };

/** Every service split out of EventsService, as ONE object — the tests were written against the single class. */
export type EventsServiceParts = Public<EventsService> &
  Public<EventAnswersService> &
  Public<EventReadService> &
  Public<AvailabilityService>;

/** The event services over one prisma, one rules service and one notification client, wired as Nest would. */
export function eventServices(prisma: any, rules: any, notifications: any): EventsServiceParts {
  const view = new EventViewService(prisma);
  const people = new EventPeopleService(prisma, rules);
  const notices = new EventNoticesService(prisma, notifications);
  const checks = new EventChecksService(prisma, rules);
  const updater = new EventUpdateService(prisma, checks, people, notices);
  return combinedServices<EventsServiceParts>(
    new EventsService(prisma, view, checks, people, notices, updater),
    new EventAnswersService(prisma, notices),
    new EventReadService(prisma, people, view),
    new AvailabilityService(prisma, rules, people, view),
  );
}
