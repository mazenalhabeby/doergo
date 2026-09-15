import { Controller, Logger, OnModuleDestroy } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { PushService } from '../modules/push/push.service';
import { WebsocketGateway } from '../modules/websocket/websocket.gateway';
import { NotificationStore } from '../common/notification-store.service';
import { KeyedCoalescer } from '../common/keyed-coalescer';

/** A burst of filings about one asset reaches each approver once per window. */
export const EXPENSE_COALESCE_WINDOW_MS = 60_000;

export interface ExpenseSubmittedEvent {
  organizationId: string;
  entryId: string;
  assetId: string;
  assetName: string;
  spaceId?: string | null;
  authorId: string;
  authorName?: string;
  category: string;
  amountCents: number;
  occurredAt: string | Date;
  recipientIds: string[];
}

export interface ExpenseDecidedEvent {
  organizationId: string;
  entryId: string;
  assetId: string;
  assetName: string;
  authorId: string;
  decision: 'accept' | 'reject';
  note?: string | null;
  amountCents: number;
  category: string;
}

export interface HandedOverEvent {
  organizationId: string;
  assetId: string;
  assetName: string;
  openedUserIds: string[];
  closedUserIds: string[];
  byUserId: string;
  at: string | Date;
}

const assetLink = (assetId: string) => `/assets/${assetId}`;

/**
 * The organization's things: an expense sent in, the answer to it, a handover.
 *
 * Three events, three audiences, and — as with leave and proposals — this
 * handler never decides WHO. Task-service routes and has already filtered the
 * recipients to people allowed to see the asset; delivery here is push + bell
 * + socket, each best-effort and independent, so an unreachable phone never
 * costs the bell entry.
 *
 * Two socket shapes on purpose:
 *   · to the RECIPIENT's room, the full event — what the bell renders live;
 *   · to the ORGANIZATION's room, ids only (`asset.expensesChanged`,
 *     `asset.custodyChanged`) — what makes an office screen that is already
 *     open refetch through its own scoped endpoint. Ids widen nothing, and a
 *     name or an amount never goes to a room everybody in the organization is in.
 */
@Controller()
export class AssetNotificationHandler implements OnModuleDestroy {
  private readonly logger = new Logger('AssetNotificationHandler');

  /** Keyed `recipient:asset`, holding the events folded into that window. */
  private readonly expenses = new KeyedCoalescer<ExpenseSubmittedEvent>(
    EXPENSE_COALESCE_WINDOW_MS,
    (key, held) => this.deliverSummary(key.slice(0, key.indexOf(':')), held),
  );

  constructor(
    private readonly pushService: PushService,
    private readonly websocketGateway: WebsocketGateway,
    private readonly store: NotificationStore,
  ) {}

  onModuleDestroy() {
    this.expenses.dispose();
  }

  // ── An expense sent in → the office ──────────────────────────────────────

  @EventPattern('asset_expense_submitted')
  async handleExpenseSubmitted(@Payload() data: ExpenseSubmittedEvent) {
    // Never back to the person who sent it, and never twice to one approver.
    const recipients = [...new Set((data.recipientIds ?? []).filter((id) => id && id !== data.authorId))];
    this.websocketGateway.emitToOrganization(data.organizationId, 'asset.expensesChanged', {
      assetId: data.assetId, entryId: data.entryId,
    });
    if (recipients.length === 0) return;

    for (const id of recipients) {
      // The socket is NOT coalesced: an open queue should show every line as it lands.
      this.websocketGateway.emitToUser(id, 'asset.expense_submitted', this.expenseSocketPayload(data));
      if (this.expenses.offer(`${id}:${data.assetId}`, data)) {
        await this.deliverExpense(id, data);
      }
    }
  }

  private expenseSocketPayload(data: ExpenseSubmittedEvent) {
    return {
      entryId: data.entryId,
      assetId: data.assetId,
      assetName: data.assetName,
      authorId: data.authorId,
      authorName: data.authorName ?? '',
      category: data.category,
      amountCents: data.amountCents,
    };
  }

  /** The first in its window: said in full. */
  private async deliverExpense(recipientId: string, data: ExpenseSubmittedEvent) {
    const title = 'An expense to confirm';
    const body = `${data.authorName || 'A member'} sent ${data.category} for ${data.assetName}`;
    await this.push(recipientId, title, body, {
      type: 'asset.expense_submitted', assetId: data.assetId, entryId: data.entryId,
    });
    await this.store.record({
      recipientIds: [recipientId],
      organizationId: data.organizationId,
      eventType: 'asset.expense_submitted',
      title,
      body,
      link: assetLink(data.assetId),
      data: { assetId: data.assetId, entryId: data.entryId, authorId: data.authorId },
    });
  }

  /**
   * Everything else that arrived in the window: one notice, counted.
   *
   * Named after the sender when there was one — "Ahmed sent 9 more for the
   * Ford" is the sentence an approver can act on — and counted when several
   * people filed against the same thing at once.
   */
  private async deliverSummary(recipientId: string, held: ExpenseSubmittedEvent[]) {
    const last = held[held.length - 1]!;
    const authors = new Set(held.map((e) => e.authorId));
    const who = authors.size === 1 ? last.authorName || 'A member' : null;
    const n = held.length;
    const title = n === 1 ? 'An expense to confirm' : 'Expenses to confirm';
    const body = who
      ? `${who} sent ${n} more for ${last.assetName}`
      : `${n} more expenses sent in for ${last.assetName}`;
    await this.push(recipientId, title, body, {
      type: 'asset.expense_submitted', assetId: last.assetId, entryId: last.entryId, count: n,
    });
    await this.store.record({
      recipientIds: [recipientId],
      organizationId: last.organizationId,
      eventType: 'asset.expense_submitted',
      title,
      body,
      link: assetLink(last.assetId),
      data: { assetId: last.assetId, entryIds: held.map((e) => e.entryId), count: n },
    });
  }

  // ── The answer → the member who sent it ──────────────────────────────────

  @EventPattern('asset_expense_decided')
  async handleExpenseDecided(@Payload() data: ExpenseDecidedEvent) {
    this.websocketGateway.emitToOrganization(data.organizationId, 'asset.expensesChanged', {
      assetId: data.assetId, entryId: data.entryId,
    });
    if (!data.authorId) return;

    const accepted = data.decision === 'accept';
    const note = String(data.note ?? '').trim().slice(0, 200);
    const title = accepted ? 'Expense accepted' : 'Expense refused';
    const what = `${data.category} for ${data.assetName}`;
    // The reason travels IN the message. A refusal that only says "no" sends
    // somebody to ask the office what happened.
    const body = accepted ? what : note ? `${what}: ${note}` : `${what} was not accepted`;

    this.websocketGateway.emitToUser(data.authorId, 'asset.expense_decided', {
      entryId: data.entryId,
      assetId: data.assetId,
      assetName: data.assetName,
      decision: data.decision,
      note: note || null,
      category: data.category,
      amountCents: data.amountCents,
    });
    await this.push(data.authorId, title, body, {
      type: 'asset.expense_decided', assetId: data.assetId, entryId: data.entryId, decision: data.decision,
    });
    await this.store.record({
      recipientIds: [data.authorId],
      organizationId: data.organizationId,
      eventType: 'asset.expense_decided',
      title,
      body,
      link: assetLink(data.assetId),
      data: { assetId: data.assetId, entryId: data.entryId, decision: data.decision },
    });
  }

  // ── A handover → whoever gained or lost the thing ────────────────────────

  @EventPattern('asset_handed_over')
  async handleHandedOver(@Payload() data: HandedOverEvent) {
    this.websocketGateway.emitToOrganization(data.organizationId, 'asset.custodyChanged', { assetId: data.assetId });

    // Whoever made the change is looking at the screen that made it.
    const receivers = [...new Set((data.openedUserIds ?? []).filter((id) => id && id !== data.byUserId))];
    const losers = [...new Set((data.closedUserIds ?? []).filter((id) => id && id !== data.byUserId && !receivers.includes(id)))];

    const groups: Array<{ ids: string[]; title: string; body: string; direction: 'to' | 'from' }> = [
      { ids: receivers, title: 'Handed over to you', body: `${data.assetName} is now with you`, direction: 'to' },
      { ids: losers, title: 'Handed back', body: `${data.assetName} was handed back`, direction: 'from' },
    ];

    for (const group of groups) {
      if (group.ids.length === 0) continue;
      for (const id of group.ids) {
        this.websocketGateway.emitToUser(id, 'asset.handed_over', {
          assetId: data.assetId, assetName: data.assetName, direction: group.direction, at: data.at,
        });
        await this.push(id, group.title, group.body, {
          type: 'asset.handed_over', assetId: data.assetId, direction: group.direction,
        });
      }
      await this.store.record({
        recipientIds: group.ids,
        organizationId: data.organizationId,
        eventType: 'asset.handed_over',
        title: group.title,
        body: group.body,
        link: assetLink(data.assetId),
        data: { assetId: data.assetId, direction: group.direction },
      });
    }
  }

  private async push(userId: string, title: string, body: string, data: Record<string, unknown>) {
    try {
      await this.pushService.sendToUser(userId, title, body, data);
    } catch (e) {
      this.logger.error(`asset push failed: ${(e as Error).message}`);
    }
  }
}
