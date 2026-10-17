import React, { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, RefreshControl, SectionList, StyleSheet, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/auth-context';
import { useTheme } from '../../contexts/theme-context';
import { oversees } from '../../lib/permissions';
import { useResponsive } from '../../lib/responsive';
import { countRouteStops } from '../../lib/my-route';
import { drivesRoutes } from '../../lib/member-reach';
import { ROUTES } from '../../lib/constants';
import { OfflineBanner } from '../../offline/components/offline-banner';
import { FreshnessLabel } from '../../offline/components/freshness-label';
import { Ground, AText, ScreenHeader, WellDivider, useTabSafe } from '../amazen';
import { TourTarget, useTourScroll } from '../tour';
import { centeredContent } from '../screen-container';
import { isCanceled, isClosed, isMine, isUnderWay, stepLabelFor, stepsFor } from '../home/my-work';
import { useTaskFlows } from '../home/use-task-flows';
import { QuietButton, SectionLabel } from '../job/job-ui';
import type { OpenSheet } from '../job/job-logic';
import type { WriteStatus } from '../job/use-job-writes';
import {
  bandOf, canCreateJobs, chipsFor, effectiveFilter, emptyKind, groupJobs, passesFilter, pickNextUp, placeOf,
  rowRight, rowWho, showsNextUp, showsRouteRow, PERIODS,
  type JobBand, type JobFacts, type JobsFilter, type Period,
} from './jobs-logic';
import { useJobsList, type ListTask } from './use-jobs-list';
import { FilterChips, SearchField, Segmented } from './jobs-controls';
import { JobRow } from './job-row';
import { NextUp } from './next-up';
import { RouteRow } from './route-row';
import { OpenForRole } from './open-for-role';
import { useJobsScreen } from './use-jobs-screen';

/**
 * THE JOBS TAB — `docs/design/job-flow.html`, `renderJobs()`.
 *
 * It answers "what next": Next up is the reader's first open job with its
 * REAL next step on the button, and under it the jobs sit in wells by band —
 * Doing now, Blocked, Overdue, Today, Later, Done. For somebody overseeing,
 * Mine / Everyone; for everybody, Now / Upcoming / History and the chips.
 *
 * ⚠️ BANDS REPLACE THE SORT MENU. The old screen's "Sort by" popup (a raw
 * `<Modal>`) ordered by a column; the bands ARE the order, and inside each the
 * shared ranking decides — the same one the home widget reads.
 *
 * ⚠️ VIRTUALISED. Everyone can be hundreds of jobs, so the wells are a
 * `SectionList` whose rows draw their own slice of the well, never one tall
 * view holding them all.
 */
export function JobsScreen({
  writeStatus,
  renderDetail,
}: {
  /** The job page's one status write, handed down by the route (`task/[id].tsx`). */
  writeStatus: WriteStatus;
  /** The tablet's right-hand pane — `TaskDetailPane`, rendered by the route. */
  renderDetail: (taskId: string, sheet: OpenSheet | null, close: () => void) => ReactNode;
}) {
  const {
    amazen,
    t,
    r,
    c,
    selected,
    setSelected,
    listView,
  } = useJobsScreen({ writeStatus, renderDetail });

  if (!r.isSplit) return listView;

  /* Wide tablets: the list on the left, the job on the right. */
  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: c.canvas }}>
      <View style={{ width: 380 }}>{listView}</View>
      <View style={{ flex: 1, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: c.lineWell }}>
        {selected ? (
          <React.Fragment key={`${selected.id}:${selected.sheet ?? ''}`}>
            {renderDetail(selected.id, selected.sheet, () => setSelected(null))}
          </React.Fragment>
        ) : (
          <Ground style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: amazen.space(6) }}>
            <AText variant="body" tone="ink" style={{ textAlign: 'center' }}>{t('tasks.selectTask')}</AText>
          </Ground>
        )}
      </View>
    </View>
  );
}
