import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { tabAccessFor } from '../../../lib/tab-layout';
import { useAuth } from '../../../contexts/auth-context';
import { useTheme } from '../../../contexts/theme-context';

/** TabsLayout's state and handlers — everything before its markup, moved here unchanged. */
export function useTabsLayout() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const { t } = useTranslation();
  // ⚠️ The same answer the bar reads — `tabAccessFor` in tab-layout.ts.
  const access = useMemo(() => tabAccessFor(user as never), [user]);
  const { isAdmin } = access;
  const showTechTasks = access.tasks;
  const showAttendance = access.attendance;
  const showTimeOff = access.timeOff;
  const showCreate = access.create;
  const showTeam = access.team;

  return {
    user,
    colors,
    t,
    access,
    isAdmin,
    showTechTasks,
    showAttendance,
    showTimeOff,
    showCreate,
    showTeam,
  };
}
