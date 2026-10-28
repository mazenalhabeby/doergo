import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '@/contexts/auth-context';
import { approvalsApi } from '@/lib/api';
import { manageRowsFor } from '@/lib/manage-rows';

/**
 * How many approvals this member can act on now (`/approvals/count` → `actionable`, cached ~20 s on the server):
 * items not half-way, or half-way and waiting for them — never one that waits for somebody else's approval, so
 * "N approvals wait for your decision" is true. Read every time home is shown; only for somebody who has the
 * Approvals row. Online only, like the inbox: a failed read shows nothing rather than an old number.
 * `ready` turns true once the first answer (or failure) is in, so the strip can wait for it.
 */
export function useApprovalsWaiting(): { count: number; ready: boolean } {
  const { user } = useAuth();
  const allowed = useMemo(() => manageRowsFor(user || {}).some((r) => r.route === '/(app)/approvals'), [user]);
  const [state, setState] = useState({ count: 0, ready: false });
  useFocusEffect(
    useCallback(() => {
      if (!allowed) {
        setState({ count: 0, ready: true });
        return;
      }
      let live = true;
      approvalsApi
        .count()
        .then((x) => live && setState({ count: Math.max(0, x.actionable || 0), ready: true }))
        .catch(() => live && setState({ count: 0, ready: true }));
      return () => {
        live = false;
      };
    }, [allowed]),
  );
  return state;
}
