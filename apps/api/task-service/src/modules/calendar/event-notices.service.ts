import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService, SERVICE_NAMES, personNameById } from '@hbcfield/shared';

/** Telling people about events: the organizer's name, a push, and the live refresh of their calendars. */
@Injectable()
export class EventNoticesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SERVICE_NAMES.NOTIFICATION) private readonly notifications: ClientProxy,
  ) {}

  /** One shared rule for a name (people/person-name.ts) — never "John null". */
  nameOf(userId: string): Promise<string> {
    return personNameById(this.prisma as never, userId);
  }

  notify(pattern: string, payload: Record<string, unknown>) {
    this.notifications.emit(pattern, payload);
  }

  /** Tell the people on an event their calendars changed (live refresh, no push). */
  refresh(organizationId: string, userIds: string[]) {
    if (userIds.length) this.notify('calendar_changed', { organizationId, userIds: [...new Set(userIds)] });
  }
}
