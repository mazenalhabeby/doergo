import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AUTO_CLOCK_DEFAULTS, autoClockUndoDeadline, type AttendanceStatus } from '@hbcfield/shared/client';
import { Banner } from '@/components/amazen';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/island/island-context';
import { useNow } from '@/hooks/use-now';
import { useOffline } from '@/offline/offline-context';
import { undoAutoClockInFromPhone } from '@/offline/attendance/shift-actions';
import { autoClockStore } from '@/services/auto-clock/store';
import { useTimeFormat } from '@/hooks/use-time-format';
import { refusalText } from '@/lib/distance';

/**
 * "Clocked in automatically at 07:02 · Undo" — for the undo window only (clock review C9). The undo lived in the
 * notification alone: swiped away, the ten minutes were gone. Same action as the notification's button, through
 * the outbox, so it works with no signal and the server judges the window by the tap.
 */
export function AutoUndoBanner({ status, onChanged }: { status: AttendanceStatus | null; onChanged: () => void }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const toast = useToast();
  const { engine } = useOffline();
  const { formatClock } = useTimeFormat();
  const now = useNow(15_000);
  const [dwell, setDwell] = useState(AUTO_CLOCK_DEFAULTS.dwellMinutes);
  const [busy, setBusy] = useState(false);
  const entry = status?.isClockedIn ? status.currentEntry : null;
  const automatic = !!entry && (entry.flagReasons ?? []).includes('AUTO_CLOCK_IN');

  // The workspace's own dwell, from the plan the phone already keeps (no request).
  useEffect(() => {
    if (!automatic || !user?.id || !entry?.locationId) return;
    let live = true;
    void autoClockStore.load(user.id).then((s) => {
      const place = s.plan?.places.find((p) => p.spaceId === entry.locationId);
      if (live && place) setDwell(place.settings.dwellMinutes);
    });
    return () => {
      live = false;
    };
  }, [automatic, user?.id, entry?.locationId]);

  if (!entry || !automatic || !engine) return null;
  const clockInAt = new Date(entry.clockInAt);
  if (now >= autoClockUndoDeadline(clockInAt, { dwellMinutes: dwell }).getTime()) return null;

  const undo = async () => {
    setBusy(true);
    try {
      const r = await undoAutoClockInFromPhone(engine, { entryId: entry.id });
      if (r.kind === 'refused') {
        toast.error(
          t('common.error'),
          refusalText(t, r, t('autoClock.undoFailed', 'Could not undo it — ask your office.')),
        );
        return;
      }
      toast.success(t('autoClock.undone', 'Automatic clock-in undone'));
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Banner
      tone="accent"
      text={t('autoClock.undoBanner', {
        time: formatClock(clockInAt),
        defaultValue: `Clocked in automatically at ${formatClock(clockInAt)}`,
      })}
      action={{ label: t('autoClock.undo', 'Undo'), onPress: () => void undo(), disabled: busy }}
    />
  );
}
