import type { ApprovalInbox, ApprovalItem } from '@hbcfield/shared/client';
import { approvalsApi } from '../../lib/api';

/**
 * The last inbox read, by `kind:id` — so opening an item draws at once instead
 * of reading every kind's list again. A detail opened cold reads it itself.
 */
const known = new Map<string, ApprovalItem>();

export const approvalKey = (i: Pick<ApprovalItem, 'kind' | 'id'>) => `${i.kind}:${i.id}`;

export function knownApproval(key: string): ApprovalItem | null {
  return known.get(key) ?? null;
}

export async function loadApprovals(): Promise<ApprovalInbox> {
  const res = await approvalsApi.list();
  known.clear();
  for (const i of res.items) known.set(approvalKey(i), i);
  return res;
}

/** A decided item leaves the list the moment the server says yes. */
export function forgetApproval(key: string): void {
  known.delete(key);
}
