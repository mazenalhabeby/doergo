import { useEffect, useRef } from 'react';
import type { TimeEntry } from '@hbcfield/shared/client';
import { useAuth } from '@/contexts/auth-context';
import { forgotOfferDueAt, leftSiteAt } from '@/lib/clock-smart';
import { autoClockNotifier } from '@/services/auto-clock/notifications';

/**
 * Keeps the phone's "You left the Warehouse at 16:42 — clock out at 16:42?"
 * notification in step with the running shift: scheduled for 25 min after the
 * later of leaving and the planned end, taken back when they come back to the
 * site, clock out, or the server stops saying when they left. The card on the
 * Time tab says the same thing (lib/clock-smart.ts `forgotClockOutOffer`).
 *
 * Only reacts to what the shift's status says — asks nothing of the network.
 */
export function useForgotOfferNotice(entry: TimeEntry | null): void {
  const { user } = useAuth();
  const key = entry ? `${entry.id}|${entry.leftSiteAt ?? ''}|${entry.expectedClockOutAt ?? ''}` : '';
  const last = useRef('');
  useEffect(() => {
    const userId = user?.id;
    if (!userId || key === last.current) return;
    const previous = last.current.split('|')[0];
    last.current = key;
    if (!entry) {
      if (previous) void autoClockNotifier.forgotOffer?.({ userId, entryId: previous, place: '', leftAt: null, at: new Date() });
      return;
    }
    const due = forgotOfferDueAt(entry);
    void autoClockNotifier.forgotOffer?.({
      userId,
      entryId: entry.id,
      place: entry.location?.name ?? '',
      leftAt: due ? leftSiteAt(entry) : null,
      at: due ?? new Date(),
    });
  }, [key, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
}
