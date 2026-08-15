import { Injectable, Inject, Logger, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { SERVICE_NAMES, success } from '@hbcfield/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationRoutingService } from '../../common/notification-routing.service';

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif'];
const ALLOWED_DOCUMENT_TYPES = ['application/pdf', 'text/plain'];
const ALLOWED_FILE_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_DOCUMENT_TYPES];
const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp',
  'image/heic': 'heic', 'image/heif': 'heif', 'application/pdf': 'pdf', 'text/plain': 'txt',
};
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
  private readonly s3Client: S3Client;
  private readonly s3Bucket: string;
  private readonly s3Endpoint: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly routing: NotificationRoutingService,
    @Inject(SERVICE_NAMES.NOTIFICATION) private readonly notificationClient: ClientProxy,
  ) {
    this.s3Endpoint = this.config.get<string>('S3_ENDPOINT', 'https://hel1.your-objectstorage.com');
    this.s3Bucket = this.config.get<string>('S3_BUCKET', 'hbcfield');
    this.s3Client = new S3Client({
      endpoint: this.s3Endpoint,
      region: this.config.get<string>('S3_REGION', 'eu-central'),
      credentials: {
        accessKeyId: this.config.get<string>('S3_ACCESS_KEY', ''),
        secretAccessKey: this.config.get<string>('S3_SECRET_KEY', ''),
      },
      forcePathStyle: true,
    });
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private async loadIssue(issueId: string, organizationId: string) {
    const issue = await this.prisma.shiftIssue.findFirst({ where: { id: issueId, organizationId } });
    if (!issue) throw new NotFoundException('Issue not found');
    return issue;
  }

  /** Access: the reporter, the dispatched assignee, or a manager (canManage). */
  private assertParticipant(issue: { reportedById: string; assignedToId: string | null }, callerUserId: string, canManage: boolean) {
    if (canManage) return;
    if (issue.reportedById === callerUserId) return;
    if (issue.assignedToId && issue.assignedToId === callerUserId) return;
    throw new ForbiddenException('Not your issue');
  }

  private async nameOf(userId: string | null | undefined): Promise<string> {
    if (!userId) return '';
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } });
    return u ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() : '';
  }

  private objectKey(organizationId: string, issueId: string, mime: string): { key: string; url: string } {
    const ext = EXT_BY_MIME[mime] ?? 'bin';
    const key = `${organizationId}/shift-issues/${issueId}/${randomUUID()}.${ext}`;
    return { key, url: `${this.s3Endpoint}/${this.s3Bucket}/${key}` };
  }

  private issuePrefix(organizationId: string, issueId: string): string {
    return `${this.s3Endpoint}/${this.s3Bucket}/${organizationId}/shift-issues/${issueId}/`;
  }

  private async signAttachments(attachments: unknown): Promise<any[]> {
    if (!Array.isArray(attachments)) return [];
    return Promise.all(
      attachments.map(async (a: Attachment) => ({ ...a, url: await this.signedGet(a.fileKey).catch(() => a.fileUrl) })),
    );
  }

  private async signedGet(key: string): Promise<string> {
    return getSignedUrl(this.s3Client, new GetObjectCommand({ Bucket: this.s3Bucket, Key: key }), { expiresIn: 3600 });
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
  }) {
    const title = (data.title ?? '').trim();
    if (!title) throw new BadRequestException('A short title is required');
    const severity = SEVERITIES.includes(data.severity ?? '') ? (data.severity as any) : 'MEDIUM';

    const issue = await this.prisma.shiftIssue.create({
      data: {
        organizationId: data.organizationId,
        reportedById: data.callerUserId,
        timeEntryId: data.timeEntryId ?? null,
        spaceId: data.spaceId ?? null,
        title: title.slice(0, 200),
        description: data.description?.slice(0, BODY_MAX) ?? null,
        severity,
        status: 'OPEN',
        events: {
          create: {
            type: 'CREATED',
            actorId: data.callerUserId,
            body: data.description?.slice(0, BODY_MAX) ?? null,
            attachments: (data.attachments ?? []) as any,
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
  async list(data: { organizationId: string; callerUserId: string; canManage?: boolean; status?: string; scope?: string }) {
    const openish = ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS'];
    const where: any = { organizationId: data.organizationId };
    if (data.status && data.status !== 'all') where.status = data.status;
    else if (data.scope === 'open') where.status = { in: openish };

    // Managers see the whole org; everyone else sees issues they reported or are assigned.
    if (!data.canManage) {
      where.OR = [{ reportedById: data.callerUserId }, { assignedToId: data.callerUserId }];
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
  async get(data: { organizationId: string; issueId: string; callerUserId: string; canManage?: boolean }) {
    const issue = await this.loadIssue(data.issueId, data.organizationId);
    this.assertParticipant(issue, data.callerUserId, !!data.canManage);

    const events = await this.prisma.shiftIssueEvent.findMany({ where: { issueId: issue.id }, orderBy: { at: 'asc' }, take: 1000 });
    const actorIds = Array.from(new Set([issue.reportedById, issue.assignedToId, ...events.map((e) => e.actorId)].filter(Boolean) as string[]));
    const users = actorIds.length ? await this.prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, firstName: true, lastName: true } }) : [];
    const nameById = new Map(users.map((u) => [u.id, `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim()]));

    const thread = await Promise.all(events.map(async (e) => ({
      ...e,
      actorName: e.actorId ? nameById.get(e.actorId) ?? '' : '',
      attachments: await this.signAttachments(e.attachments),
    })));

    return success({
      ...issue,
      reporterName: nameById.get(issue.reportedById) ?? '',
      assigneeName: issue.assignedToId ? nameById.get(issue.assignedToId) ?? '' : null,
      thread,
    });
  }

  // ── add a message to the thread ───────────────────────────────────────────────
  async addMessage(data: { organizationId: string; issueId: string; callerUserId: string; canManage?: boolean; body?: string; attachments?: Attachment[] }) {
    const issue = await this.loadIssue(data.issueId, data.organizationId);
    this.assertParticipant(issue, data.callerUserId, !!data.canManage);
    const body = (data.body ?? '').trim();
    if (!body && !(data.attachments ?? []).length) throw new BadRequestException('Empty message');

    const event = await this.prisma.shiftIssueEvent.create({
      data: { issueId: issue.id, type: 'MESSAGE', actorId: data.callerUserId, body: body.slice(0, BODY_MAX) || null, attachments: (data.attachments ?? []) as any },
    });
    await this.prisma.shiftIssue.update({ where: { id: issue.id }, data: { updatedAt: new Date() } });
    await this.broadcast(issue, data.callerUserId, event);
    const signed = { ...event, attachments: await this.signAttachments(event.attachments), actorName: await this.nameOf(data.callerUserId) };
    return success(signed);
  }

  // ── acknowledge ──────────────────────────────────────────────────────────────
  async acknowledge(data: { organizationId: string; issueId: string; callerUserId: string; canManage?: boolean }) {
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
  async assign(data: { organizationId: string; issueId: string; callerUserId: string; canManage?: boolean; assignToId: string }) {
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
  async setStatus(data: { organizationId: string; issueId: string; callerUserId: string; canManage?: boolean; status: string; note?: string }) {
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
        body: resolving ? (data.note?.slice(0, BODY_MAX) ?? null) : null,
        metadata: { fromStatus: issue.status, toStatus: data.status } as any,
      },
    });
    await this.broadcast(updated, data.callerUserId, event);
    return success(updated);
  }

  // ── attachments (S3) ──────────────────────────────────────────────────────────
  async presignAttachment(data: { organizationId: string; issueId: string; callerUserId: string; canManage?: boolean; fileName: string; mimeType: string }) {
    const issue = await this.loadIssue(data.issueId, data.organizationId);
    this.assertParticipant(issue, data.callerUserId, !!data.canManage);
    if (!ALLOWED_FILE_TYPES.includes(data.mimeType)) throw new BadRequestException('File type not allowed');
    if (!data.fileName || data.fileName.length > 255) throw new BadRequestException('Invalid file name');
    const { key, url } = this.objectKey(data.organizationId, issue.id, data.mimeType);
    const command = new PutObjectCommand({ Bucket: this.s3Bucket, Key: key, ContentType: data.mimeType });
    const uploadUrl = await getSignedUrl(this.s3Client, command, { expiresIn: 3600 });
    return success({ uploadUrl, fileKey: key, fileUrl: url, expiresIn: 3600, maxFileSize: MAX_FILE_SIZE });
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
