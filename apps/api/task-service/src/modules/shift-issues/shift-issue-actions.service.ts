import { Injectable, ForbiddenException, BadRequestException } from '@nestjs/common';
import { success, personName } from '@hbcfield/shared';
import { createOnce } from '../../common/create-once.util';
import { BODY_MAX, Attachment } from './shift-issues-helpers';
import { ShiftIssuesBase } from './shift-issues.base';
import type { ShiftIssueStatus } from '@prisma/client';

/** Working an issue: a message, acknowledging it, giving it to somebody, changing its status. */
@Injectable()
export class ShiftIssueActionsService extends ShiftIssuesBase {
  // ── add a message to the thread ───────────────────────────────────────────────
  async addMessage(data: {
    organizationId: string;
    issueId: string;
    callerUserId: string;
    canManage?: boolean;
    ledSpaceIds?: string[];
    body?: string;
    attachments?: Attachment[];
    /** Made on the phone: a message sent twice is still one message. */
    id?: string;
  }) {
    const issue = await this.loadIssue(data.issueId, data.organizationId);
    this.assertParticipant(issue, data.callerUserId, !!data.canManage, data.ledSpaceIds);
    const body = (data.body ?? '').trim();
    const attachments = this.cleanAttachments(issue, data.attachments);
    if (!body && !attachments.length) throw new BadRequestException('Empty message');

    const { row: event, created } = await createOnce({
      id: data.id,
      find: (id) => this.prisma.shiftIssueEvent.findUnique({ where: { id } }),
      isSame: (e) => e.issueId === issue.id && e.actorId === data.callerUserId,
      create: () =>
        this.prisma.shiftIssueEvent.create({
          data: {
            ...(data.id ? { id: data.id } : {}),
            issueId: issue.id,
            type: 'MESSAGE',
            actorId: data.callerUserId,
            body: body.slice(0, BODY_MAX) || null,
            attachments: attachments,
          },
        }),
    });
    if (!created) {
      return success({
        ...event,
        attachments: await this.signAttachments(issue, event.attachments),
        actorName: await this.nameOf(data.callerUserId),
      });
    }
    await this.prisma.shiftIssue.update({ where: { id: issue.id }, data: { updatedAt: new Date() } });
    await this.broadcast(issue, data.callerUserId, event);
    const signed = {
      ...event,
      attachments: await this.signAttachments(issue, event.attachments),
      actorName: await this.nameOf(data.callerUserId),
    };
    return success(signed);
  }

  // ── acknowledge ──────────────────────────────────────────────────────────────
  async acknowledge(data: {
    organizationId: string;
    issueId: string;
    callerUserId: string;
    canManage?: boolean;
    ledSpaceIds?: string[];
  }) {
    const issue = await this.loadIssue(data.issueId, data.organizationId);
    if (!data.canManage && issue.assignedToId !== data.callerUserId)
      throw new ForbiddenException('Only the responsible can acknowledge');
    const updated = await this.prisma.shiftIssue.update({
      where: { id: issue.id },
      data: {
        status: issue.status === 'OPEN' ? 'ACKNOWLEDGED' : issue.status,
        acknowledgedById: issue.acknowledgedById ?? data.callerUserId,
        acknowledgedAt: issue.acknowledgedAt ?? new Date(),
      },
    });
    const event = await this.prisma.shiftIssueEvent.create({
      data: { issueId: issue.id, type: 'ACKNOWLEDGED', actorId: data.callerUserId },
    });
    await this.broadcast(updated, data.callerUserId, event);
    return success(updated);
  }

  // ── assign / dispatch someone ─────────────────────────────────────────────────
  async assign(data: {
    organizationId: string;
    issueId: string;
    callerUserId: string;
    canManage?: boolean;
    ledSpaceIds?: string[];
    assignToId: string;
  }) {
    const issue = await this.loadIssue(data.issueId, data.organizationId);
    if (!data.canManage) throw new ForbiddenException('Only the responsible can dispatch');
    const assignee = await this.prisma.user.findFirst({
      where: { id: data.assignToId, organizationId: data.organizationId },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!assignee) throw new BadRequestException('Assignee not found');
    const assignedToName = personName(assignee);

    const updated = await this.prisma.shiftIssue.update({
      where: { id: issue.id },
      data: {
        assignedToId: assignee.id,
        status: issue.status === 'OPEN' || issue.status === 'ACKNOWLEDGED' ? 'IN_PROGRESS' : issue.status,
      },
    });
    const event = await this.prisma.shiftIssueEvent.create({
      data: {
        issueId: issue.id,
        type: 'ASSIGNED',
        actorId: data.callerUserId,
        metadata: { assignedToId: assignee.id, assignedToName },
      },
    });
    await this.broadcast(updated, data.callerUserId, event, [assignee.id]);
    return success({ ...updated, assigneeName: assignedToName });
  }

  // ── status change / resolve ───────────────────────────────────────────────────
  async setStatus(data: {
    organizationId: string;
    issueId: string;
    callerUserId: string;
    canManage?: boolean;
    ledSpaceIds?: string[];
    status: string;
    note?: string;
  }) {
    const issue = await this.loadIssue(data.issueId, data.organizationId);
    // Reporter can only cancel their own; managers/assignee can drive the rest.
    const isAssignee = issue.assignedToId === data.callerUserId;
    if (!data.canManage && !isAssignee && !(issue.reportedById === data.callerUserId && data.status === 'CANCELED')) {
      throw new ForbiddenException('Not allowed to change this issue');
    }
    const valid = ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'CANCELED'];
    if (!valid.includes(data.status)) throw new BadRequestException('Invalid status');
    const resolving = data.status === 'RESOLVED';
    const reopening = data.status === 'IN_PROGRESS' && issue.status === 'RESOLVED';

    const updated = await this.prisma.shiftIssue.update({
      where: { id: issue.id },
      data: {
        status: data.status as ShiftIssueStatus,
        resolutionNote: resolving ? (data.note?.slice(0, BODY_MAX) ?? issue.resolutionNote) : issue.resolutionNote,
        resolvedById: resolving ? data.callerUserId : issue.resolvedById,
        resolvedAt: resolving ? new Date() : issue.resolvedAt,
      },
    });
    const event = await this.prisma.shiftIssueEvent.create({
      data: {
        issueId: issue.id,
        type: resolving ? 'RESOLVED' : reopening ? 'REOPENED' : data.status === 'CLOSED' ? 'CLOSED' : 'STATUS_CHANGED',
        actorId: data.callerUserId,
        // The reason / excuse ("parts not delivered") — kept on the event for
        // resolve / cancel / close so it shows inline in the thread.
        body: data.note?.trim().slice(0, BODY_MAX) || null,
        metadata: { fromStatus: issue.status, toStatus: data.status },
      },
    });
    await this.broadcast(updated, data.callerUserId, event);
    return success(updated);
  }
}
