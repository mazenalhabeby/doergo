import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { success, personName } from '@hbcfield/shared';
import { newObjectKey, requireObjectStore } from '@hbcfield/shared/storage';
import {
  MAX_FILE_SIZE,
  ALLOWED_FILE_TYPES,
  UPLOAD_TTL_SECONDS,
  SEVERITIES,
  BODY_MAX,
  Attachment,
} from './shift-issues-helpers';
import { ShiftIssuesBase } from './shift-issues.base';

/**
 * Shift Issues (blockers). A member reports a problem during a shift; the
 * responsible person (resolved via NotificationRoutingService) is notified and
 * the whole thing plays out on ONE live thread — chat messages + system events
 * (acknowledged / dispatched / resolved) interleaved. Real-time + push ride the
 * existing notification-service (`shift_issue_*` emits). Photos go phone→S3.
 */
@Injectable()
export class ShiftIssuesService extends ShiftIssuesBase {
  // ── create ───────────────────────────────────────────────────────────────
  async create(data: {
    organizationId: string;
    callerUserId: string;
    title: string;
    description?: string;
    severity?: string;
    timeEntryId?: string;
    spaceId?: string;
    attachments?: Attachment[];
    /** Made on the phone: a report sent twice is still one issue. */
    id?: string;
  }) {
    const title = (data.title ?? '').trim();
    if (!title) throw new BadRequestException('A short title is required');
    const severity = SEVERITIES.includes(data.severity ?? '') ? (data.severity as any) : 'MEDIUM';

    if (data.id) {
      const prior = await this.prisma.shiftIssue.findUnique({ where: { id: data.id }, include: { events: true } });
      if (prior) {
        if (prior.reportedById !== data.callerUserId)
          throw new ConflictException({ message: 'This id is already in use', code: 'ID_IN_USE' });
        return success(prior);
      }
    }

    /*
      The shift and the site are the reporter's OWN, in their organization.
      Both were stored as sent, so an issue could name another member's shift
      (or another organization's site) and be routed by it.
    */
    const timeEntryId = data.timeEntryId
      ? ((
          await this.prisma.timeEntry.findFirst({
            where: { id: data.timeEntryId, userId: data.callerUserId, organizationId: data.organizationId },
            select: { id: true },
          })
        )?.id ?? null)
      : null;
    const spaceId = data.spaceId
      ? ((
          await this.prisma.companyLocation.findFirst({
            where: { id: data.spaceId, organizationId: data.organizationId },
            select: { id: true },
          })
        )?.id ?? null)
      : null;

    const issue = await this.prisma.shiftIssue.create({
      data: {
        ...(data.id ? { id: data.id } : {}),
        organizationId: data.organizationId,
        reportedById: data.callerUserId,
        timeEntryId,
        spaceId,
        title: title.slice(0, 200),
        description: data.description?.slice(0, BODY_MAX) ?? null,
        severity,
        status: 'OPEN',
        events: {
          create: {
            type: 'CREATED',
            actorId: data.callerUserId,
            body: data.description?.slice(0, BODY_MAX) ?? null,
            // Photos on the report are uploaded AFTER create (the S3 key needs the
            // issue id) and posted as the reporter's first message.
            attachments: [] as any,
          },
        },
      },
      include: { events: true },
    });

    const recipientIds = await this.watcherIds(data.callerUserId, data.organizationId);
    const reporterName = await this.nameOf(data.callerUserId);
    this.emit('shift_issue_created', {
      issueId: issue.id,
      organizationId: data.organizationId,
      title: issue.title,
      severity: issue.severity,
      reporterId: data.callerUserId,
      reporterName,
      recipientIds,
    });
    return success(issue);
  }

  // ── list ───────────────────────────────────────────────────────────────────
  async list(data: {
    organizationId: string;
    callerUserId: string;
    canManage?: boolean;
    /** Spaces where the caller oversees the work (space-role grant). */
    ledSpaceIds?: string[];
    status?: string;
    scope?: string;
  }) {
    const openish = ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS'];
    const where: any = { organizationId: data.organizationId };
    if (data.status && data.status !== 'all') where.status = data.status;
    else if (data.scope === 'open') where.status = { in: openish };

    /*
      Managers see the whole org; everyone else sees their own issues — plus
      everything on a site they lead, which is the case this used to miss.
    */
    if (!data.canManage) {
      where.OR = [
        { reportedById: data.callerUserId },
        { assignedToId: data.callerUserId },
        ...(data.ledSpaceIds?.length ? [{ spaceId: { in: data.ledSpaceIds } }] : []),
      ];
    }

    const issues = await this.prisma.shiftIssue.findMany({
      where,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 200,
    });
    // Enrich with reporter/assignee names + a message count in one pass.
    const ids = Array.from(
      new Set(issues.flatMap((i) => [i.reportedById, i.assignedToId].filter(Boolean) as string[])),
    );
    const users = ids.length
      ? await this.prisma.user.findMany({
          where: { id: { in: ids } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const nameById = new Map(users.map((u) => [u.id, personName(u)]));
    const counts = await this.prisma.shiftIssueEvent.groupBy({
      by: ['issueId'],
      where: { issueId: { in: issues.map((i) => i.id) } },
      _count: { id: true },
    });
    const countById = new Map(counts.map((c) => [c.issueId, c._count.id]));
    return success(
      issues.map((i) => ({
        ...i,
        reporterName: nameById.get(i.reportedById) ?? '',
        assigneeName: i.assignedToId ? (nameById.get(i.assignedToId) ?? '') : null,
        eventCount: countById.get(i.id) ?? 0,
      })),
    );
  }

  // ── get (issue + full thread) ────────────────────────────────────────────────
  async get(data: {
    organizationId: string;
    issueId: string;
    callerUserId: string;
    canManage?: boolean;
    ledSpaceIds?: string[];
  }) {
    const issue = await this.loadIssue(data.issueId, data.organizationId);
    this.assertParticipant(issue, data.callerUserId, !!data.canManage, data.ledSpaceIds);

    const events = await this.prisma.shiftIssueEvent.findMany({
      where: { issueId: issue.id },
      orderBy: { at: 'asc' },
      take: 1000,
    });
    const actorIds = Array.from(
      new Set([issue.reportedById, issue.assignedToId, ...events.map((e) => e.actorId)].filter(Boolean) as string[]),
    );
    const users = actorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const nameById = new Map(users.map((u) => [u.id, personName(u)]));

    const thread = await Promise.all(
      events.map(async (e) => ({
        ...e,
        actorName: e.actorId ? (nameById.get(e.actorId) ?? '') : '',
        attachments: await this.signAttachments(issue, e.attachments),
      })),
    );

    return success({
      ...issue,
      reporterName: nameById.get(issue.reportedById) ?? '',
      assigneeName: issue.assignedToId ? (nameById.get(issue.assignedToId) ?? '') : null,
      thread,
    });
  }

  // ── attachments (S3) ──────────────────────────────────────────────────────────
  async presignAttachment(data: {
    organizationId: string;
    issueId: string;
    callerUserId: string;
    canManage?: boolean;
    ledSpaceIds?: string[];
    fileName: string;
    mimeType: string;
  }) {
    const issue = await this.loadIssue(data.issueId, data.organizationId);
    this.assertParticipant(issue, data.callerUserId, !!data.canManage, data.ledSpaceIds);
    if (!ALLOWED_FILE_TYPES.includes(data.mimeType)) throw new BadRequestException('File type not allowed');
    if (!data.fileName || data.fileName.length > 255) throw new BadRequestException('Invalid file name');
    const store = requireObjectStore(this.store);
    const key = newObjectKey({
      organizationId: data.organizationId,
      kind: 'shift-issues',
      parentId: issue.id,
      mime: data.mimeType,
    });
    const upload = await store.presignUpload(key, data.mimeType, undefined, UPLOAD_TTL_SECONDS);
    return success({
      uploadUrl: upload.url,
      fileKey: key,
      // LEGACY: app 1.0.5 echoes this back in the message. Not a readable URL.
      fileUrl: store.privateUrl(key),
      expiresIn: UPLOAD_TTL_SECONDS,
      maxFileSize: MAX_FILE_SIZE,
    });
  }
}
