import { Injectable, Inject, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { SERVICE_NAMES, personNameById } from '@hbcfield/shared';
import { emitEvent, shiftIssueEventEvent, type EventContract } from '@hbcfield/shared/microservices';
import { OBJECT_STORE, ObjectStore } from '@hbcfield/shared/storage';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MediaSigner } from '../../common/storage/media-signer.service';
import { NotificationRoutingService } from '../../common/notification-routing.service';
import { ALLOWED_FILE_TYPES, Attachment } from './shift-issues-helpers';

/**
 * What every shift-issue path shares: loading one, who takes part, names,
 * attachments, watchers, and telling everybody.
 */
@Injectable()
export abstract class ShiftIssuesBase {
  protected readonly logger = new Logger(this.constructor.name);

  constructor(
    protected readonly prisma: PrismaService,
    protected readonly routing: NotificationRoutingService,
    @Inject(SERVICE_NAMES.NOTIFICATION) protected readonly notificationClient: ClientProxy,
    @Inject(OBJECT_STORE) protected readonly store: ObjectStore | null,
    protected readonly media: MediaSigner,
  ) {}

  // ── helpers ────────────────────────────────────────────────────────────────

  protected async loadIssue(issueId: string, organizationId: string) {
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
  protected assertParticipant(
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

  /** One shared rule for a name (people/person-name.ts) — never "John null". */
  protected nameOf(userId: string | null | undefined): Promise<string> {
    return personNameById(this.prisma as never, userId);
  }

  protected issuePrefix(organizationId: string, issueId: string): string {
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
  protected async signAttachments(issue: { id: string; organizationId: string }, attachments: unknown): Promise<any[]> {
    return this.media.signAll(this.cleanAttachments(issue, attachments));
  }

  /** Resolve the responsible people for the reporter (managers/space leaders). */
  protected async watcherIds(reportedById: string, organizationId: string): Promise<string[]> {
    const { ids } = await this.routing.resolveWatchers(reportedById, organizationId, 'attendance', false);
    return ids;
  }

  protected emit<P>(contract: EventContract<P>, payload: P) {
    try {
      emitEvent(this.notificationClient, contract, payload);
    } catch (e) {
      this.logger.warn(`emit ${contract.name} failed: ${e}`);
    }
  }

  // Confirm is folded into addMessage/create: the client sends the attachment
  // metadata array with the message. We only validate the prefix here on read.

  // ── broadcast: persist bumped + emit socket/push ────────────────────────────────
  protected async broadcast(
    issue: {
      id: string;
      organizationId: string;
      reportedById: string;
      assignedToId: string | null;
      title: string;
      severity: string;
      status: string;
    },
    actorId: string,
    event: { id: string; type: string; body: string | null; at: Date; metadata?: unknown },
    extraRecipients: string[] = [],
  ) {
    const watchers = await this.watcherIds(issue.reportedById, issue.organizationId);
    const recipientIds = Array.from(
      new Set([
        ...watchers,
        issue.reportedById,
        ...(issue.assignedToId ? [issue.assignedToId] : []),
        ...extraRecipients,
      ]),
    ).filter((id) => id !== actorId);
    const actorName = await this.nameOf(actorId);
    this.emit(shiftIssueEventEvent, {
      issueId: issue.id,
      organizationId: issue.organizationId,
      title: issue.title,
      severity: issue.severity,
      status: issue.status,
      event: {
        id: event.id,
        type: event.type,
        body: event.body,
        at: event.at,
        actorId,
        actorName,
        // A thread event's metadata is a JSON object (or none) — Prisma types it as any JSON value.
        metadata: (event.metadata as Record<string, unknown> | null) ?? null,
      },
      actorId,
      actorName,
      recipientIds,
    });
  }
}
