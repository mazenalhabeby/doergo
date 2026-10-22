import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { eventPattern, type EventPayload, overtimeNoticeEvent } from '@hbcfield/shared/microservices';
import { OVERTIME_NOTICE_KINDS, overtimeNoticeKeys } from '@hbcfield/shared';
import { PushService } from '../../push/push.service';
import { NotificationStore } from '../../inbox/notification-store.service';
import { msg, type LocalizedText } from '../../../i18n/translate';

/**
 * The overtime-request flow's pushes (task-service `OvertimeService`).
 *
 * ⚠️ These used to be emitted as `push_notification`, which nothing here
 * listened to — the prompt at the end of a shift, the request to approvers,
 * the refusal and the auto clock-out reached nobody. Each notice now names
 * what happened and is rendered in every recipient's own language from the
 * catalogue (`overtime.<kind>.title|body`). `data.type` is the phone's tap
 * routing, unchanged.
 */
@Controller()
export class OvertimeNotificationHandler {
  private readonly logger = new Logger('OvertimeNotificationHandler');

  constructor(
    private readonly pushService: PushService,
    private readonly store: NotificationStore,
  ) {}

  @EventPattern(eventPattern(overtimeNoticeEvent))
  async handle(@Payload() notice: EventPayload<typeof overtimeNoticeEvent>) {
    const ids = [...new Set((notice?.recipientIds ?? []).filter((x) => typeof x === 'string' && x))];
    if (!ids.length || !(OVERTIME_NOTICE_KINDS as readonly string[]).includes(notice.kind)) return;
    const keys = overtimeNoticeKeys(notice.kind);
    const p = notice.params ?? {};
    // A refusal reason is a person's own words: passed through as written.
    const params = { name: p.name ?? '', location: p.location ?? '', reason: p.reason ?? '' };
    const text: LocalizedText = { title: msg(keys.title as never, params), body: msg(keys.body as never, params) };
    try {
      await this.pushService.sendToUsers(ids, text, { ...notice.data });
    } catch (error) {
      this.logger.error(`Failed to send overtime notice (${notice.kind}): ${error}`);
    }
    await this.store.record({
      recipientIds: ids,
      organizationId: notice.organizationId,
      eventType: `overtime.${notice.kind}`,
      text,
      link: '/overtime',
      data: { ...notice.data },
    });
  }
}
