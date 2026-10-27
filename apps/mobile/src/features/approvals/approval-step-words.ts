import type { TFunction } from 'i18next';
import type { ApprovalItem } from '@hbcfield/shared/client';

/** The sentence for an item half-way through an office rule — and whether the caller's approval finishes it. */
export function stepNoticeText(step: NonNullable<ApprovalItem['step']>, t: TFunction): string {
  if (step.mine) return t('approvals.step.mine', { role: step.roleName });
  if (step.youFinish) return t('approvals.step.youFinish', { name: step.firstByName });
  if (step.waitsForYou) return t('approvals.step.youCanGive', { name: step.firstByName, role: step.roleName });
  return t('approvals.step.waiting', { name: step.firstByName, role: step.roleName });
}

/** The small marks on an item: it waits for the caller; the leave's dates are already over. */
export function approvalTags(item: ApprovalItem): ('waitsForYou' | 'datesPassed')[] {
  const tags: ('waitsForYou' | 'datesPassed')[] = [];
  if (item.step?.waitsForYou) tags.push('waitsForYou');
  if (item.data.datesPassed === true) tags.push('datesPassed');
  return tags;
}
