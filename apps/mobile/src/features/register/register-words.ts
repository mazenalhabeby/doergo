import { personName } from '@hbcfield/shared/client';
import type { TFunction } from 'i18next';
import type { RegisterHolder } from '@/lib/api';

/** Who has it, in words — a member's name, else a client's. Several: the first and how many more. */
export function holderName(holders: RegisterHolder[] | undefined | null): string | null {
  const names = (holders ?? [])
    .map((h) => (h.user ? personName(h.user) : h.customer?.name ?? ''))
    .filter(Boolean);
  if (names.length === 0) return null;
  return names.length === 1 ? names[0]! : `${names[0]} +${names.length - 1}`;
}

/** The four record states, as the web says them. */
export function statusLabel(t: TFunction, status: string): string {
  switch (status) {
    case 'ACTIVE': return t('register.status.ACTIVE', 'Active');
    case 'INACTIVE': return t('register.status.INACTIVE', 'Inactive');
    case 'MAINTENANCE': return t('register.status.MAINTENANCE', 'In maintenance');
    case 'RETIRED': return t('register.status.RETIRED', 'Retired');
    default: return status;
  }
}

export const SETTABLE_STATUSES = ['ACTIVE', 'INACTIVE', 'MAINTENANCE'] as const;
