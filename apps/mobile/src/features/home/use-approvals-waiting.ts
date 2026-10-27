import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '@/contexts/auth-context';
import { approvalsApi } from '@/lib/api';
import { manageRowsFor } from '@/lib/manage-rows';

/**
 * How many approvals wait for this member — the same number as the More → Approvals badge (`/approvals/count`,
 * cached ~20 s on the server). Read every time home is shown; only for somebody who has the Approvals row.
 * Online only, like the inbox: a failed read shows nothing rather than an old number.
 */
export function useApprovalsWaiting(): number {
  const { user } = useAuth();
  const allowed = useMemo(() => manageRowsFor(user || {}).some((r) => r.route === '/(app)/approvals'), [user]);
  const [count, setCount] = useState(0);
  useFocusEffect(
    useCallback(() => {
      if (!allowed) {
        setCount(0);
        return;
      }
      let live = true;
      approvalsApi
        .count()
        .then((x) => live && setCount(Math.max(0, x.total || 0)))
        .catch(() => live && setCount(0));
      return () => {
        live = false;
      };
    }, [allowed]),
  );
  return count;
}
