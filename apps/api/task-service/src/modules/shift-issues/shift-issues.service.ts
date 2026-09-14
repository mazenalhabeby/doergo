import { Injectable, Inject, Logger, NotFoundException, ForbiddenException, BadRequestException, ConflictException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { SERVICE_NAMES, success } from '@hbcfield/shared';
import { OBJECT_STORE, ObjectStore, newObjectKey, requireObjectStore } from '@hbcfield/shared/storage';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MediaSigner } from '../../common/storage/media-signer.service';
import { NotificationRoutingService } from '../../common/notification-routing.service';
import { createOnce } from '../../common/create-once.util';

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif'];
const ALLOWED_DOCUMENT_TYPES = ['application/pdf', 'text/plain'];
const ALLOWED_FILE_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_DOCUMENT_TYPES];
const UPLOAD_TTL_SECONDS = 3600;
const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
const BODY_MAX = 5000;

type Attachment = { fileKey: string; fileUrl: string; fileName: string; fileSize: number; mimeType: string; width?: number | null; height?: number | null };

/**
 * Shift Issues (blockers). A member reports a problem during a shift; the
 * responsible person (resolved via NotificationRoutingService) is notified and
 * the whole thing plays out on ONE live thread — chat messages + system events
 * (acknowledged / dispatched / resolved) interleaved. Real-time + push ride the
 * existing notification-service (`shift_issue_*` emits). Photos go phone→S3.
 */
@Injectable()
export class ShiftIssuesService {
  private readonly logger = new Logger(ShiftIssuesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly routing: NotificationRoutingService,
    @Inject(SERVICE_NAMES.NOTIFICATION) private readonly notificationClient: ClientProxy,
    @Inject(OBJECT_STORE) private readonly store: ObjectStore | null,
    private readonly media: MediaSigner,
  ) {}

  // ── helpers ────────────────────────────────────────────────────────────────

  private async loadIssue(issueId: string, organizationId: string) {
    const issue = await this.prisma.shiftIssue.findFirst({ where: { id: issueId, organizationId } });
    if (!issue) throw new NotFoundException('Issue not found');
    return issue;
  }

  /** Access: the reporter, the dispatched assignee, or a manager (canManage). */
  /**
   * May this caller open this issue?
   *
   * Reporter, dispatched worker, an org-wide manager — and now the person who
   * oversees the SPACE it happened on. They are the one the notification goes
   * to, so being refused the thread it points at was the whole feature failing
   * for exactly the people it is for.
   */
  private assertParticipant(
    issue: { reportedById: string; assignedToId: string | null; spaceId?: string | null },
    callerUserId: string,
    canManage: boolean,
    ledSpaceIds?: string[],
  ) {
    if (canManage) return;
    if (issue.reportedById === callerUserId) return;
    if (issue.assignedToId && issue.assignedToId === callerUserId) return;
    if (issue.spaceId && ledSpaceIds?.includes(issue.spaceId)) return;
    throw new ForbiddenException('Not your issue');
  }

  private async nameOf(userId: string | null | undefined): Promise<string> {
    if (!userId) return '';
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } });
    return u ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() : '';
  }

  private issuePrefix(organizationId: string, issueId: string): string {
    return `${organizationId}/shift-issues/${issueId}/`;
  }

  /**
   * Keep only attachments whose object lives under THIS issue's prefix.
   *
   * ⚠️ The KEY is what gets signed, so the key is what is checked. This used to
   * check the prefix of `fileUrl` and then sign `fileKey` as sent — a member
   * could pair a valid-looking URL with another organization's key and be handed
   * a signed link to that organization's file. The key is now taken from the
   * key if it passes, else read out of the legacy URL, and must pass either way.
   */
  cleanAttachments(issue: { id: string; organizationId: string }, attachments: unknown): Attachment[] {
    if (!Array.isArray(attachments)) return [];
    const prefix = this.issuePrefix(issue.organizationId, issue.id);
    const within = (k: unknown): k is string => typeof k === 'string' && k.startsWith(prefix) && !k.includes('..');
    const out: Attachment[] = [];
    for (const a of attachments.slice(0, 10) as any[]) {
      if (!a) continue;
      const fromUrl = this.store?.keyFromUrl(a.fileUrl) ?? null;
      const key = within(a.fileKey) ? a.fileKey : within(fromUrl) ? fromUrl : null;
      if (!key) continue;
      out.push({
        fileKey: key,
        fileUrl: this.store ? this.store.privateUrl(key) : '',
        fileName: String(a.fileName ?? 'file').slice(0, 255),
        fileSize: Number(a.fileSize) || 0,
        mimeType: ALLOWED_FILE_TYPES.includes(String(a.mimeType)) ? String(a.mimeType) : '',
        width: typeof a.width === 'number' ? a.width : null,
        height: typeof a.height === 'number' ? a.height : null,
      });
    }
    return out;
  }

  /**
   * Signed links for a thread event's files — re-checked against the issue's
   * prefix on READ as well, so a key stored before the write check existed can
   * never be signed for someone who should not see it.
   */
  private async signAttachments(issue: { id: string; organizationId: string }, attachments: unknown): Promise<any[]> {
    return this.media.signAll(this.cleanAttachments(issue, attachments));
  }

  /** Resolve the responsible people for the reporter (managers/space leaders). */
  private async watcherIds(reportedById: string, organizationId: string): Promise<string[]> {
    const { ids } = await this.routing.resolveWatchers(reportedById, organizationId, 'attendance', false);
    return ids;
  }

  private emit(event: string, payload: Record<string, unknown>) {
    try { this.notificationClient.emit(event, payload); } catch (e) { this.logger.warn(`emit ${event} failed: ${e}`); }
  }

  // ── create ───────────────────────────────────────────────────────────────
  async create(data: {
    organizationId: string; callerUserId: string; title: string; description?: string;
    severity?: string; timeEntryId?: string; spaceId?: string; attachments?: Attachment[];
    /** Made on the phone: a report sent twice is still one issue. */
    id?: string;
  }) {
    const title = (data.title ?? '').trim();
    if (!title) throw new BadRequestException('A short title is required');
    const severity = SEVERITIES.includes(data.severity ?? '') ? (data.severity as any) : 'MEDIUM';

    if (data.id) {
      const prior = await this.prisma.shiftIssue.findUnique({ where: { id: data.id }, include: { events: true } });
      if (prior) {
        if (prior.reportedById !== data.callerUserId) throw new ConflictException({ message: 'This id is already in use', code: 'ID_IN_USE' });
        return success(prior);
      }
    }

    /*
      The shift and the site are the reporter's OWN, in their organization.
      Both were stored as sent, so an issue could name another member's shift
      (or another organization's site) and be routed by it.
    */
    const timeEntryId = data.timeEntryId
      ? (await this.prisma.timeEntry.findFirst({ where: { id: data.timeEntryId, userId: data.callerUserId, organizationId: data.organizationId }, select: { id: true } }))?.id ?? null
      : null;
    const spaceId = data.spaceId
      ? (await this.prisma.companyLocation.findFirst({ where: { id: data.spaceId, organizationId: data.organizationId }, select: { id: true } }))?.id ?? null
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
      issueId: issue.id, organizationId: data.organizationId, title: issue.title, severity: issue.severity,
      reporterId: data.callerUserId, reporterName, recipientIds,
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
    const ids = Array.from(new Set(issues.flatMap((i) => [i.reportedById, i.assignedToId].filter(Boolean) as string[])));
    const users = ids.length ? await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true } }) : [];
    const nameById = new Map(users.map((u) => [u.id, `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim()]));
    const counts = await this.prisma.shiftIssueEvent.groupBy({ by: ['issueId'], where: { issueId: { in: issues.map((i) => i.id) } }, _count: { id: true } });
    const countById = new Map(counts.map((c) => [c.issueId, c._count.id]));
    return success(issues.map((i) => ({
      ...i,
      reporterName: nameById.get(i.reportedById) ?? '',
      assigneeName: i.assignedToId ? nameById.get(i.assignedToId) ?? '' : null,
      eventCount: countById.get(i.id) ?? 0,
    })));
  }

  // ── get (issue + full thread) ────────────────────────────────────────────────
  async get(data: { organizationId: string; issueId: string; callerUserId: string; canManage?: boolean; ledSpaceIds?: string[] }) {
    const issue = await this.loadIssue(data.issueId, data.organizationId);
    this.assertParticipant(issue, data.callerUserId, !!data.canManage, data.ledSpaceIds);

    const events = await this.prisma.shiftIssueEvent.findMany({ where: { issueId: issue.id }, orderBy: { at: 'asc' }, take: 1000 });
    const actorIds = Array.from(new Set([issue.reportedById, issue.assignedToId, ...events.map((e) => e.actorId)].filter(Boolean) as string[]));
    const users = actorIds.length ? await this.prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, firstName: true, lastName: true } }) : [];
    const nameById = new Map(users.map((u) => [u.id, `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim()]));

    const thread = await Promise.all(events.map(async (e) => ({
      ...e,
      actorName: e.actorId ? nameById.get(e.actorId) ?? '' : '',
      attachments: await this.signAttachments(issue, e.attachments),
    })));

    return success({
      ...issue,
      reporterName: nameById.get(issue.reportedById) ?? '',
      assigneeName: issue.assignedToId ? nameById.get(issue.assignedToId) ?? '' : null,
      thread,
    });
  }

  // ── add a message to the thread ───────────────────────────────────────────────
  async addMessage(data: { organizationId: string; issueId: string; callerUserId: string; canManage?: boolean; ledSpaceIds?: string[]; body?: string; attachments?: Attachment[];
    /** Made on the phone: a message sent twice is still one message. */
    id?: string }) {
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
          data: { ...(data.id ? { id: data.id } : {}), issueId: issue.id, type: 'MESSAGE', actorId: data.callerUserId, body: body.slice(0, BODY_MAX) || null, attachments: attachments as any },
        }),
    });
    if (!created) {
      return success({ ...event, attachments: await this.signAttachments(issue, event.attachments), actorName: await this.nameOf(data.callerUserId) });
    }
    await this.prisma.shiftIssue.update({ where: { id: issue.id }, data: { updatedAt: new Date() } });
    await this.broadcast(issue, data.callerUserId, event);
    const signed = { ...event, attachments: await this.signAttachments(issue, event.attachments), actorName: await this.nameOf(data.callerUserId) };
    return success(signed);
  }

  // ── acknowledge ──────────────────────────────────────────────────────────────
  async acknowledge(data: { organizationId: string; issueId: string; callerUserId: string; canManage?: boolean; ledSpaceIds?: string[] }) {
    const issue = await this.loadIssue(data.issueId, data.organizationId);
    if (!data.canManage && issue.assignedToId !== data.callerUserId) throw new ForbiddenException('Only the responsible can acknowledge');
    const updated = await this.prisma.shiftIssue.update({
      where: { id: issue.id },
      data: { status: issue.status === 'OPEN' ? 'ACKNOWLEDGED' : issue.status, acknowledgedById: issue.acknowledgedById ?? data.callerUserId, acknowledgedAt: issue.acknowledgedAt ?? new Date() },
    });
    const event = await this.prisma.shiftIssueEvent.create({ data: { issueId: issue.id, type: 'ACKNOWLEDGED', actorId: data.callerUserId } });
    await this.broadcast(updated, data.callerUserId, event);
    return success(updated);
  }

  // ── assign / dispatch someone ─────────────────────────────────────────────────
  async assign(data: { organizationId: string; issueId: string; callerUserId: string; canManage?: boolean; ledSpaceIds?: string[]; assignToId: string }) {
    const issue = await this.loadIssue(data.issueId, data.organizationId);
    if (!data.canManage) throw new ForbiddenException('Only the responsible can dispatch');
    const assignee = await this.prisma.user.findFirst({ where: { id: data.assignToId, organizationId: data.organizationId }, select: { id: true, firstName: true, lastName: true } });
    if (!assignee) throw new BadRequestException('Assignee not found');
    const assignedToName = `${assignee.firstName ?? ''} ${assignee.lastName ?? ''}`.trim();

    const updated = await this.prisma.shiftIssue.update({
      where: { id: issue.id },
      data: { assignedToId: assignee.id, status: issue.status === 'OPEN' || issue.status === 'ACKNOWLEDGED' ? 'IN_PROGRESS' : issue.status },
    });
    const event = await this.prisma.shiftIssueEvent.create({
      data: { issueId: issue.id, type: 'ASSIGNED', actorId: data.callerUserId, metadata: { assignedToId: assignee.id, assignedToName } as any },
    });
    await this.broadcast(updated, data.callerUserId, event, [assignee.id]);
    return success({ ...updated, assigneeName: assignedToName });
  }

  // ── status change / resolve ───────────────────────────────────────────────────
  async setStatus(data: { organizationId: string; issueId: string; callerUserId: string; canManage?: boolean; ledSpaceIds?: string[]; status: string; note?: string }) {
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
        status: data.status as any,
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
        metadata: { fromStatus: issue.status, toStatus: data.status } as any,
      },
    });
    await this.broadcast(updated, data.callerUserId, event);
    return success(updated);
  }

  // ── attachments (S3) ──────────────────────────────────────────────────────────
  async presignAttachment(data: { organizationId: string; issueId: string; callerUserId: string; canManage?: boolean; ledSpaceIds?: string[]; fileName: string; mimeType: string }) {
    const issue = await this.loadIssue(data.issueId, data.organizationId);
    this.assertParticipant(issue, data.callerUserId, !!data.canManage, data.ledSpaceIds);
    if (!ALLOWED_FILE_TYPES.includes(data.mimeType)) throw new BadRequestException('File type not allowed');
    if (!data.fileName || data.fileName.length > 255) throw new BadRequestException('Invalid file name');
    const store = requireObjectStore(this.store);
    const key = newObjectKey({ organizationId: data.organizationId, kind: 'shift-issues', parentId: issue.id, mime: data.mimeType });
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

  // Confirm is folded into addMessage/create: the client sends the attachment
  // metadata array with the message. We only validate the prefix here on read.

  // ── broadcast: persist bumped + emit socket/push ────────────────────────────────
  private async broadcast(issue: { id: string; organizationId: string; reportedById: string; assignedToId: string | null; title: string; severity: string; status: string }, actorId: string, event: { id: string; type: string; body: string | null; at: Date; metadata?: unknown }, extraRecipients: string[] = []) {
    const watchers = await this.watcherIds(issue.reportedById, issue.organizationId);
    const recipientIds = Array.from(new Set([...watchers, issue.reportedById, ...(issue.assignedToId ? [issue.assignedToId] : []), ...extraRecipients])).filter((id) => id !== actorId);
    const actorName = await this.nameOf(actorId);
    this.emit('shift_issue_event', {
      issueId: issue.id, organizationId: issue.organizationId, title: issue.title, severity: issue.severity, status: issue.status,
      event: { id: event.id, type: event.type, body: event.body, at: event.at, actorId, actorName, metadata: event.metadata ?? null },
      actorId, actorName, recipientIds,
    });
  }
}
