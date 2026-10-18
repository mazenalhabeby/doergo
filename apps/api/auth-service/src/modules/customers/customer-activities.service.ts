import type { CustomerActivityType } from '@prisma/client';
import { Injectable, NotFoundException } from '@nestjs/common';
import { findPrior } from '@hbcfield/shared';
import {
  CLIENT_ID,
  CrmCaller,
  capText,
  normalizeReminderKind,
  normalizeRepeat,
  advanceDate,
} from './customers-helpers';
import { CustomersServiceBase } from './customers-service.base';
import { withAuthors } from '../../common/records/with-authors';

/** A client's timeline: notes, calls, reminders. */
@Injectable()
export class CustomerActivitiesService extends CustomersServiceBase {
  /** Timeline (newest first), author names resolved. */
  async listActivities(data: { customerId: string; organizationId: string; caller?: CrmCaller }) {
    await this.assertCrmReach(data.customerId, data.organizationId, data.caller);
    const rows = await this.prisma.customerActivity.findMany({
      where: { customerId: data.customerId, organizationId: data.organizationId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return { data: await withAuthors(this.prisma, rows) };
  }

  async addActivity(data: {
    customerId: string;
    organizationId: string;
    type?: string;
    body?: string;
    dueAt?: string;
    authorId?: string;
    reminderKind?: string;
    remindBeforeMin?: number;
    reminderAssigneeId?: string | null;
    repeat?: string;
    caller?: CrmCaller;
    /** Made on the phone: an activity logged twice is one activity. */
    clientId?: string;
  }) {
    await this.assertCrmReach(data.customerId, data.organizationId, data.caller, { needWork: true });
    const clientId = typeof data.clientId === 'string' && CLIENT_ID.test(data.clientId) ? data.clientId : undefined;
    const prior = await findPrior({
      id: clientId,
      find: (id) => this.prisma.customerActivity.findUnique({ where: { id } }),
      isSame: (a) => a.customerId === data.customerId && a.authorId === (data.authorId ?? null),
    });
    if (prior) return { data: prior };
    // Stored as sent; the database refuses a value that is not an activity type (as it always did).
    const type = (data.type ?? 'NOTE') as CustomerActivityType;
    const isReminder = type === 'REMINDER';
    const dueAt = data.dueAt ? new Date(data.dueAt) : null;
    const remindBeforeMin = isReminder ? Math.max(0, Math.floor(data.remindBeforeMin ?? 0)) : null;
    // A reminder assignee must be a member of this org (else drop → all managers).
    const assigneeId =
      isReminder && data.reminderAssigneeId
        ? ((await this.keepOrgUserIds([data.reminderAssigneeId], data.organizationId))[0] ?? null)
        : null;
    const activity = await this.prisma.customerActivity.create({
      data: {
        ...(clientId ? { id: clientId } : {}),
        organizationId: data.organizationId,
        customerId: data.customerId,
        type,
        body: capText(data.body),
        authorId: data.authorId ?? null,
        dueAt,
        reminderKind: isReminder ? normalizeReminderKind(data.reminderKind) : null,
        remindBeforeMin,
        notifyAt: isReminder && dueAt ? new Date(dueAt.getTime() - (remindBeforeMin ?? 0) * 60000) : null,
        reminderAssigneeId: assigneeId,
        repeat: isReminder ? normalizeRepeat(data.repeat) : 'NONE',
      },
    });
    return { data: activity };
  }

  async updateActivity(data: {
    id: string;
    customerId: string;
    organizationId: string;
    body?: string;
    dueAt?: string | null;
    done?: boolean;
    reminderKind?: string;
    remindBeforeMin?: number;
    reminderAssigneeId?: string | null;
    repeat?: string;
    caller?: CrmCaller;
  }) {
    await this.assertCrmReach(data.customerId, data.organizationId, data.caller, { needWork: true });
    const existing = await this.prisma.customerActivity.findFirst({
      where: { id: data.id, customerId: data.customerId },
      select: {
        dueAt: true,
        remindBeforeMin: true,
        repeat: true,
        reminderKind: true,
        body: true,
        authorId: true,
        reminderAssigneeId: true,
        doneAt: true,
      },
    });
    if (!existing) throw new NotFoundException('Activity not found');

    const upd: Record<string, unknown> = {};
    if (data.body !== undefined) upd.body = capText(data.body);
    if (data.dueAt !== undefined) upd.dueAt = data.dueAt ? new Date(data.dueAt) : null;
    if (data.done !== undefined) upd.doneAt = data.done ? new Date() : null;
    if (data.reminderKind !== undefined) upd.reminderKind = normalizeReminderKind(data.reminderKind);
    if (data.remindBeforeMin !== undefined) upd.remindBeforeMin = Math.max(0, Math.floor(data.remindBeforeMin));
    if (data.reminderAssigneeId !== undefined) {
      upd.reminderAssigneeId = data.reminderAssigneeId
        ? ((await this.keepOrgUserIds([data.reminderAssigneeId], data.organizationId))[0] ?? null)
        : null;
    }
    if (data.repeat !== undefined) upd.repeat = normalizeRepeat(data.repeat);

    // Recompute the fire time whenever the due time or lead changes, and re-arm
    // the notification (clear notifiedAt) so a rescheduled/snoozed reminder fires again.
    if (data.dueAt !== undefined || data.remindBeforeMin !== undefined) {
      const due = (upd.dueAt as Date | null | undefined) ?? existing.dueAt ?? null;
      const lead = (upd.remindBeforeMin as number | undefined) ?? existing.remindBeforeMin ?? 0;
      upd.notifyAt = due ? new Date(due.getTime() - lead * 60000) : null;
      upd.notifiedAt = null;
    }
    const activity = await this.prisma.customerActivity.update({ where: { id: data.id }, data: upd });

    // Recurrence: completing a repeating reminder spawns the next occurrence.
    const justCompleted = data.done === true && !existing.doneAt;
    const repeat = (upd.repeat as string | undefined) ?? existing.repeat ?? 'NONE';
    if (justCompleted && repeat !== 'NONE' && existing.dueAt) {
      const nextDue = advanceDate(existing.dueAt, repeat);
      const lead = existing.remindBeforeMin ?? 0;
      await this.prisma.customerActivity.create({
        data: {
          organizationId: data.organizationId,
          customerId: data.customerId,
          type: 'REMINDER',
          body: existing.body ?? null,
          authorId: existing.authorId ?? null,
          reminderKind: existing.reminderKind ?? 'OTHER',
          remindBeforeMin: lead,
          dueAt: nextDue,
          notifyAt: new Date(nextDue.getTime() - lead * 60000),
          reminderAssigneeId: existing.reminderAssigneeId ?? null,
          repeat,
        },
      });
    }
    return { data: activity };
  }

  async deleteActivity(data: { id: string; customerId: string; organizationId: string; caller?: CrmCaller }) {
    await this.assertCrmReach(data.customerId, data.organizationId, data.caller, { needWork: true });
    await this.prisma.customerActivity.deleteMany({ where: { id: data.id, customerId: data.customerId } });
    return { success: true };
  }
}
