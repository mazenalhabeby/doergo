'use client';

import { APPROVAL_KIND_SPECS, approvalActionsFor, describeApproval, type ApprovalT } from '@hbcfield/shared/client';
import { formatDay } from '../../lib/money';
import { ISO_DAY } from './approval-detail-helpers';
import type { useApprovalDetail } from './use-approval-detail';

/** What ApprovalDetail works out after its early returns, moved here unchanged; called from the same place. */
export function ApprovalDetailView({
  t,
  i18n,
  item,
  armed,
  reason,
  minutes,
  expiresOn,
}: {
  t: ReturnType<typeof useApprovalDetail>['t'];
  i18n: ReturnType<typeof useApprovalDetail>['i18n'];
  item: NonNullable<ReturnType<typeof useApprovalDetail>['item']>;
  armed: ReturnType<typeof useApprovalDetail>['armed'];
  reason: ReturnType<typeof useApprovalDetail>['reason'];
  minutes: ReturnType<typeof useApprovalDetail>['minutes'];
  expiresOn: ReturnType<typeof useApprovalDetail>['expiresOn'];
}) {
  const text = describeApproval(item, t as unknown as ApprovalT, i18n.language);
  const actions = approvalActionsFor(item);
  const pageOnly = item.canDecide && actions.length === 0 && !!APPROVAL_KIND_SPECS[item.kind].needsPage?.(item);
  const facts: [string, string, string | undefined][] = [
    ...(item.space ? [[t('approvals.fact.workspace'), item.space.name, undefined]] as [string, string, undefined][] : []),
    ...text.facts.map((f) => [f.label, f.value, f.tone] as [string, string, string | undefined]),
    ...(item.raisedAt
      ? ([[t('approvals.fact.raised'), formatDay(item.raisedAt, i18n.language), undefined]] as [string, string, undefined][])
      : []),
  ];

  const minutesOk = Number.isInteger(Number(minutes)) && Number(minutes) >= 1 && Number(minutes) <= 1440;
  const ready = armed
    && !(armed.reason === 'required' && !reason.trim())
    && !(armed.input === 'minutes' && !minutesOk)
    && !(armed.input === 'expiresOn' && expiresOn !== '' && !ISO_DAY.test(expiresOn));

  return { text, actions, pageOnly, facts, ready };
}
