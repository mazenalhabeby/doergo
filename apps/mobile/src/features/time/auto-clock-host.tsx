import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { useAuth } from '../../contexts/auth-context';
import { isExternalMember } from '../../lib/member-reach';
import { onAppResume } from '../../lib/app-resume';
import { useOffline } from '../../offline/offline-context';
import { refreshAutoClock } from '../../services/auto-clock/plan';

/**
 * Keeps the automatic clock's plan current: on sign-in, once the member's
 * outbox is running, on the app's one throttled resume, and when the office's
 * "a workspace uses it" push arrives with the app open (so the switch appears
 * at once). Draws nothing.
 *
 * Lives inside OfflineProvider — the automatic clock files its steps in the
 * same outbox as a tap, so there is nothing to arm until that outbox runs.
 */
export function AutoClockHost() {
  const { user } = useAuth();
  const { running, starting } = useOffline();
  const userId = user?.id ?? null;
  const organizationId = user?.organizationId ?? null;
  const external = isExternalMember(user);

  useEffect(() => {
    // External members hold no clock: nothing to fetch, nothing to arm.
    if (!userId || !organizationId || starting || external) return;
    const member = { userId, organizationId };
    void refreshAutoClock(member);
    const offOffered = Notifications.addNotificationReceivedListener((n) => {
      if (n.request.content.data?.type === 'attendance.auto_clock_offered') void refreshAutoClock(member);
    });
    const offResume = onAppResume(() => void refreshAutoClock(member));
    return () => {
      offOffered.remove();
      offResume();
    };
  }, [userId, organizationId, running, starting, external]);

  return null;
}
