/**
 * Each existing pending list's row → one inbox item. Pure; the gateway feeds
 * it what the lists returned (as the caller), nothing more.
 *
 * The group (NOW / TODAY / LATER) is decided here, once, from facts the row
 * already carries — never stored, so it moves on its own as time passes.
 */
import { APPROVAL_KIND_SPECS, type ApprovalItem } from './approval-kinds';
import { iso, item, nameOf, person, type ApprovalContext, type Row } from './approval-item-base';
import { timeApprovals } from './approval-items-time';

export type { ApprovalContext } from './approval-item-base';

export const toApproval = {
  ...timeApprovals,

  /** A problem reported on a shift, not yet taken by anybody. */
  issue(r: Row, ctx: ApprovalContext, spaceNames: Map<string, string>): ApprovalItem {
    const urgent = r.severity === 'URGENT' || r.severity === 'HIGH';
    const it = item('issue', ctx, {
      id: r.id,
      subject: { id: r.reportedById ?? null, name: r.reporterName ?? '', avatarUrl: null },
      space: r.spaceId ? { id: r.spaceId, name: spaceNames.get(r.spaceId) ?? '' } : null,
      raisedAt: iso(r.createdAt),
      dueAt: null,
      group: urgent ? 'NOW' : 'LATER',
      data: { title: r.title ?? null, severity: r.severity ?? null, assigneeName: r.assigneeName ?? null },
    });
    // Acknowledging is the org's or the assignee's (the route's own rule).
    if (r.assignedToId && r.assignedToId === ctx.me) it.canDecide = true;
    return it;
  },

  /** Money a member filed against an asset, waiting to count. */
  expense(r: Row, ctx: ApprovalContext): ApprovalItem {
    return item('expense', ctx, {
      id: r.id,
      subject: person(r.author),
      space: null,
      raisedAt: iso(r.createdAt),
      dueAt: null,
      group: 'LATER',
      data: {
        assetName: r.asset?.name ?? null,
        category: r.category ?? null,
        amountCents: r.amountCents ?? null,
        currency: ctx.currency ?? null,
        occurredAt: iso(r.occurredAt),
        hasReceipt: !!r.hasReceipt,
      },
    });
  },

  /** A page a member sent in to become an asset. */
  assetProposal(r: Row, ctx: ApprovalContext): ApprovalItem {
    const f = (r.fields ?? {}) as Row;
    return item('assetProposal', ctx, {
      id: r.id,
      subject: person(r.raisedBy),
      space: null,
      raisedAt: iso(r.createdAt),
      dueAt: null,
      group: 'LATER',
      data: {
        documentKind: r.documentKind ?? null,
        categoryId: r.categoryId ?? null,
        plate: f.plate ?? f.registration ?? null,
        name: f.name ?? f.model ?? null,
        holderName: nameOf(r.holder) || null,
      },
    });
  },

  /** A member-supplied document to verify. */
  document(r: Row, ctx: ApprovalContext): ApprovalItem {
    return item('document', ctx, {
      id: r.id,
      subject: person(r.member),
      space: null,
      raisedAt: iso(r.submittedAt),
      dueAt: null,
      group: 'LATER',
      data: {
        title: r.title ?? r.typeLabel ?? null,
        typeLabel: r.typeLabel ?? null,
        expiresOn: r.expiresOn ?? null,
        hasExpiry: !!r.hasExpiry,
        blocksWork: !!r.blocksWork,
      },
    });
  },

  /** Somebody who used the organization's join code. */
  join(r: Row, ctx: ApprovalContext): ApprovalItem {
    return item('join', ctx, {
      id: r.id,
      subject: person(r.user),
      space: null,
      raisedAt: iso(r.createdAt),
      dueAt: null,
      group: 'LATER',
      data: { email: r.user?.email ?? null, message: r.message ?? null },
    });
  },

  /** A client's request through the portal, not yet a job. */
  clientRequest(r: Row, ctx: ApprovalContext, portalId: string): ApprovalItem {
    return item('clientRequest', ctx, {
      id: r.id,
      subject: { id: r.customerId ?? null, name: r.customerName ?? '', avatarUrl: null },
      space: r.spaceId ? { id: r.spaceId, name: r.spaceName ?? '' } : null,
      raisedAt: iso(r.createdAt),
      dueAt: null,
      group: 'TODAY',
      data: {
        title: r.title ?? null,
        reference: r.reference ?? null,
        unitName: r.unitName ?? null,
        priority: r.priority ?? null,
        portalId,
        suggestedSpaceId: r.suggestedSpaceId ?? null,
        suggestedSpaceName: r.suggestedSpaceName ?? null,
      },
    });
  },

  /** A guest organization asks for a job or a worker in a shared workspace. */
  guestRequest(r: Row, ctx: ApprovalContext, space: { id: string; name: string }): ApprovalItem {
    return item('guestRequest', ctx, {
      id: r.id,
      subject: { id: r.requestedById ?? null, name: '', avatarUrl: null },
      space,
      raisedAt: iso(r.createdAt),
      dueAt: null,
      group: 'TODAY',
      data: { requestType: r.type ?? null, title: r.title ?? null, note: r.note ?? null },
    });
  },
};

/**
 * Extra time and overtime read the SAME OvertimeRequest rows when a shift's
 * extra time is asked through the new flow: show each shift once — the live
 * extra-time item wins, because it is the one still being worked.
 */
export function dedupeApprovals(items: ApprovalItem[]): ApprovalItem[] {
  const liveEntries = new Set(items.filter((i) => i.kind === 'extraTime').map((i) => i.id));
  return items.filter(
    (i) => !(i.kind === 'overtime' && i.data.timeEntryId && liveEntries.has(String(i.data.timeEntryId))),
  );
}

/** The decision buttons an item shows, after its own needs. */
export function approvalActionsFor(item: ApprovalItem) {
  const spec = APPROVAL_KIND_SPECS[item.kind];
  if (!item.canDecide || spec.needsPage?.(item)) return [];
  // One of its approvals is already theirs (the first or a later one): the next person approves; anybody may reject.
  if (item.step?.mine || item.step?.youApproved) return spec.actions.filter((a) => a.id !== 'approve');
  return spec.actions;
}
