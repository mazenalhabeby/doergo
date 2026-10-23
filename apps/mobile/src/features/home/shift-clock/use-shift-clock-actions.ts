import { fixForTap } from '@hbcfield/shared/client';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { BreakType } from '@hbcfield/shared/client';
import { useToast } from '@/island/island-context';
import { useShift, useShiftActions } from '@/offline/attendance/use-shift';
import type { useClockIn } from '@/hooks/use-clock-in';
import type { useMyHandovers } from '@/hooks/use-my-handovers';
import { stopBackgroundHeartbeat } from '@/services/background-heartbeat';
import { stopGeofence } from '@/services/background-geofence';

/**
 * What the shift card's buttons DO: clock out, start a rest, end a rest — and
 * the one `busy` flag that greys every disc while one of them is in flight.
 *
 * Split out of `shift-clock-card.tsx` (which draws) so the writes read in one
 * place. The sheet's frozen clock-out time stays with the card: it is what the
 * member is looking at, not part of the write.
 */
export function useShiftClockActions({
  shift,
  entryId,
  clockIn,
  handovers,
}: {
  shift: ReturnType<typeof useShift>;
  entryId: string | undefined;
  clockIn: ReturnType<typeof useClockIn>;
  handovers: ReturnType<typeof useMyHandovers>;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const actions = useShiftActions();
  const refresh = shift.refresh;
  const breaks = shift.breaks;
  const [busy, setBusy] = useState(false);

  const confirmClockOut = useCallback(
    async (input: {
      notes?: string;
      earlyReason?: string;
      overtimeReason?: string;
      handovers?: { taskId: string; note: string }[];
    }) => {
      if (!entryId) return;
      setBusy(true);
      try {
        /*
        ⚠️ A MISSING FIX IS NOT A FAILURE. `ClockOutInput` says a clock-out with
        no coordinates SKIPS the geofence check rather than faking (0,0) — so
        location being off must not stop somebody going home. The old flow
        returned early when `getCurrentLocation()` gave null, which is the same
        bug as a required note wearing a different hat.
      */
        // A stale last-known position is dropped, not sent: the server would refuse it as "not taken
        // at the moment" and nobody could go home (fixForTap, shared sync/occurrence.ts).
        const fix = fixForTap(await clockIn.getCurrentLocation().catch(() => null));
        const outcome = await actions.clockOut({ entryId, fix, ...input });
        if (outcome.kind === 'refused') {
          toast.error(
            t('common.error'),
            (outcome.code && t(`offline.errors.${outcome.code}`, { defaultValue: '' })) ||
              outcome.message ||
              t('home.fullTime.failedToClockOut'),
          );
          return;
        }
        if (outcome.kind === 'queued') toast.info(t('offline.savedForLater'));
        await stopBackgroundHeartbeat();
        await stopGeofence();
        await refresh();
        handovers.refetch();
      } catch (err) {
        toast.error(t('common.error'), (err as Error)?.message || t('home.fullTime.failedToClockOut'));
      } finally {
        setBusy(false);
      }
    },
    [entryId, clockIn, actions, toast, t, refresh, handovers],
  );

  /*
    The rests. Both go through `useShiftActions`, so they queue with no signal
    exactly as the clock does.

    ⚠️ `ruleId` NAMES THE PLANNED REST THIS SATISFIES. Without it the server
    picks whichever is next — which is what "take my rest now" means, and is
    right for the Break disc. The overdue one names the rule, so the plan is
    marked taken rather than a second rest appearing beside the one that is due.
  */
  const startRest = useCallback(
    async (input?: { ruleId?: string; type?: BreakType; notes?: string }) => {
      if (!entryId) return;
      setBusy(true);
      try {
        const outcome = await actions.startRest({ entryId, ...input });
        if (outcome.kind === 'refused') {
          toast.error(t('common.error'), outcome.message || t('common.error'));
          return;
        }
        if (outcome.kind === 'queued') toast.info(t('offline.savedForLater'));
        await refresh();
      } finally {
        setBusy(false);
      }
    },
    [entryId, actions, toast, t, refresh],
  );

  const endRest = useCallback(async () => {
    const breakId = breaks?.currentBreak?.id;
    if (!entryId || !breakId) return;
    setBusy(true);
    try {
      const outcome = await actions.endRest({ entryId, breakId });
      if (outcome.kind === 'refused') {
        toast.error(t('common.error'), outcome.message || t('common.error'));
        return;
      }
      if (outcome.kind === 'queued') toast.info(t('offline.savedForLater'));
      await refresh();
    } finally {
      setBusy(false);
    }
  }, [entryId, breaks?.currentBreak?.id, actions, toast, t, refresh]);

  return { busy, confirmClockOut, startRest, endRest };
}
