import { useMemo } from 'react';
import { assetEntryDateExempt } from '@hbcfield/shared/client';
import { useAuth } from '../contexts/auth-context';
import { logEntryDayBounds } from '../lib/log-dates';

/**
 * The days an entry against an asset may be dated with — a logbook line or a
 * receipt — for the member signed in, by the rule the server refuses by.
 *
 * ⚠️ The ORG-WIDE grant, not "in any space": every route that files an entry
 * reads `req.user.canManageAssets`, so a Space Manager's depot grant does not
 * reach it — offering them last year would be a day chosen and then refused.
 */
export function useEntryDayBounds() {
  const { user } = useAuth();
  const canManageAssets = assetEntryDateExempt(user as never);
  const bounds = useMemo(() => logEntryDayBounds(new Date(), { canManageAssets }), [canManageAssets]);
  return { canManageAssets, bounds };
}
