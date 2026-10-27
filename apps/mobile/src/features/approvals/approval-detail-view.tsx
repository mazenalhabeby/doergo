'use client';

import { APPROVAL_KIND_SPECS, approvalActionsFor, describeApproval, type ApprovalT } from '@hbcfield/shared/client';
import { formatDay } from '@/lib/money';
import { ISO_DAY } from './approval-detail-helpers';
import { durationInRange, durationMinutes } from './approval-duration';
import type { useApprovalDetail } from './use-approval-detail';
import { minutesText } from './approval-duration';

/** What ApprovalDetail works out after its early returns, moved here unchanged; called from the same place. */
export function ApprovalDetailView({
  t,
  i18n,
  item,
  armed,
  reason,
  duration,
  expiresOn,
}: {
  t: ReturnType<typeof useApprovalDetail>['t'];
  i18n: ReturnType<typeof useApprovalDetail>['i18n'];
  item: NonNullable<ReturnType<typeof useApprovalDetail>['item']>;
  armed: ReturnType<typeof useApprovalDetail>['armed'];
  reason: ReturnType<typeof useApprovalDetail>['reason'];
  duration: ReturnType<typeof useApprovalDetail>['duration'];
  expiresOn: ReturnType<typeof useApprovalDetail>['expiresOn'];
}) {
  const text = describeApproval(item, t as unknown as ApprovalT, i18n.language, undefined, (n) => minutesText(n, t));
  const actions = approvalActionsFor(item);
  const pageOnly = item.canDecide && actions.length === 0 && !!APPROVAL_KIND_SPECS[item.kind].needsPage?.(item);
  const facts: [string, string, string | undefined][] = [
    ...(item.space
      ? ([[t('approvals.fact.workspace'), item.space.name, undefined]] as [string, string, undefined][])
      : []),
    ...text.facts.map((f) => [f.label, f.value, f.tone] as [string, string, string | undefined]),
    ...(item.raisedAt
      ? ([[t('approvals.fact.raised'), formatDay(item.raisedAt, i18n.language), undefined]] as [
          string,
          string,
          undefined,
        ][])
      : []),
  ];

  // The server refuses anything outside 1 min – 24 h: nothing is sent until the fields read inside it.
  const minutesOk = durationInRange(durationMinutes(duration));
  const ready =
    armed &&
    !(armed.reason === 'required' && !reason.trim()) &&
    !(armed.input === 'minutes' && !minutesOk) &&
    !(armed.input === 'expiresOn' && expiresOn !== '' && !ISO_DAY.test(expiresOn));

  return { text, actions, pageOnly, facts, ready };
}
