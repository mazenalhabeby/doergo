import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/auth-context';
import { useTheme } from '../../contexts/theme-context';
import {
  locationsApi,
  attendanceApi,
  membersApi,
  type Task,
  type OrgMember,
  type LocationWithMembers,
  type LocationAssignment,
} from '../../lib/api';
import type { TimeEntry } from '../../lib/api/types';
import { ErrorState, Skeleton, ScreenContainer } from '../../components';
import { ShiftClockCard } from './shift-clock-card';
import { OutOfRingHomeBanner } from '../out-of-ring-home-banner';
import { AlwaysLocationNudge } from '../always-location-nudge';
import { useExcursionSync } from '../../hooks/useExcursionSync';
import type { GeofenceExcursion, CompanyLocation } from '../../lib/api/types';
import { TourTarget, useTourScroll } from '../tour';
import { ROUTES } from '../../lib/constants';
import { hasAccessModule, isFieldWorker, canManageMembersInSpace, TaskStatus } from '@hbcfield/shared/client';
import { holds } from '../../lib/permissions';
import { styles as homeStyles, SPACING, COLORS } from './home-styles';
import { WorkspaceCard, type WorkspaceBoxData } from './workspace/workspace-card';
import { SitePulse } from './site-pulse';
import { NeedsList, type NeedItem } from './needs-list';
import { QuickActions } from './quick-actions';
import { CrewLine, type CrewMember } from './crew-line';
import { type PersonNodeData } from './workspace/person-node';
import { ActivitySheet, type LiveEvent, type PendingActionItem } from './workspace/activity-sheet';
import { AssignMemberSheet } from './workspace/assign-member-sheet';
import { MemberDetailSheet, type MemberSummary } from './workspace/member-detail-sheet';
import {
  getInitials,
  shortName,
  getEmployeeStatus,
  isOnline,
  isClockedIn,
  timeAgo,
  STATUS_DOT,
  STATUS_ACTION,
  ACTIVE_TASK_PRIORITY,
} from './workspace/helpers';
import { DocumentsReminderCard } from '../documents-reminder-card';
import { useHomeTasks } from '../../offline/tasks/use-home-tasks';
import { OfflineBanner } from '../../offline/components/offline-banner';
import { FreshnessLabel } from '../../offline/components/freshness-label';

// Dynamic grid — every card is half-width and dropped into the shorter of two
// columns (masonry). Columns stay balanced, cards are filled to their width,
// and the only slack lands bottom-right where the Activity FAB floats.
const GRID_GAP = 10;

/** Rough rendered height of a card, used only to balance the two columns. */
function estimateHeight(box: WorkspaceBoxData): number {
  const groupRows = (n: number) => (n > 0 ? 22 + Math.ceil(n / 2) * 74 : 0);
  let h = 44; // header
  h += box.people.length > 0 ? Math.ceil(box.people.length / 2) * 74 : 34;
  h += groupRows(box.onRoadPeople?.length || 0);
  h += groupRows(box.remotePeople?.length || 0);
  h += groupRows(box.offShiftPeople?.length || 0);
  h += groupRows(box.offDutyPeople?.length || 0);
  if (box.type === 'fixed') h += 44; // actions row
  return h + 12; // marginBottom
}

/** Was this finished today, in the reader's own day? */
function isToday(iso?: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

/** Distribute boxes across two balanced columns (greedy shortest-column). */
function splitColumns(boxes: WorkspaceBoxData[]): [WorkspaceBoxData[], WorkspaceBoxData[]] {
  const cols: [WorkspaceBoxData[], WorkspaceBoxData[]] = [[], []];
  const heights = [0, 0];
  for (const box of boxes) {
    const target = heights[0] <= heights[1] ? 0 : 1;
    cols[target].push(box);
    heights[target] += estimateHeight(box);
  }
  return cols;
}

export function AdminDashboard() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const tourScroll = useTourScroll();

  // The viewer is online by definition (they're on this screen right now) — never
  // let their own lastActiveAt lag drop them into "Off Duty".
  const memberOnline = useCallback(
    (m: { id: string; lastActiveAt?: string | null }) => m.id === user?.id || isOnline(m.lastActiveAt),
    [user?.id],
  );

  /*
    May this viewer act on attendance at all?

    The same question `GET /attendance/approvals/pending` asks
    (`@RequirePermissionInSpace('canViewSpaceAttendance')`), so the row, the
    request behind it and the server's answer all agree — an admin org-wide, a
    supervisor in their own space, nobody else.
  */
  const canReviewHours = holds(user, 'canViewSpaceAttendance');

  /*
    The list, from the phone's copy when it has one.

    Every other read on this screen already degrades quietly — `.catch(() =>
    [])` on the locations, the directory, the open entries — so `tasksApi.list()`
    was the single call that could throw, and it took the whole board down with
    it. Read through the shared reader so this screen and the Tasks tab cannot
    disagree about the same jobs.
  */
  const { tasks, updatedAt: tasksUpdatedAt, load: loadTasks } = useHomeTasks();
  const [locations, setLocations] = useState<LocationWithMembers[]>([]);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [activeBreaks, setActiveBreaks] = useState<Array<{ userId: string }>>([]);
  const [assignments, setAssignments] = useState<Record<string, string[]>>({});
  const [rosters, setRosters] = useState<LocationAssignment[]>([]);
  /* How many shifts are waiting on this viewer — a count, not the rows. */
  const [pendingHours, setPendingHours] = useState(0);

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activityOpen, setActivityOpen] = useState(false);
  const [assignLocationId, setAssignLocationId] = useState<string | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  const initialFetchDoneRef = useRef(false);
  const fetchingRef = useRef(false);
  const lastFetchTimeRef = useRef(0);

  const load = useCallback(async (showRefresh = false) => {
    if (fetchingRef.current && !showRefresh) return;
    try {
      lastFetchTimeRef.current = Date.now();
      fetchingRef.current = true;
      if (showRefresh) setIsRefreshing(true);
      else setIsLoading(true);
      setError(null);

      /*
        The member directory is an ORG-wide read (`@RequirePermission
        ('canManageUsers')`), so a member whose authority comes from a SPACE —
        a Space Manager, a client's supervisor — can only ever be refused it.
        Asking anyway cost a guaranteed 403 on every load AND emptied the
        board: every name on it is looked up in that directory, so their own
        space rendered as "no one assigned yet" with eight people on its roster.

        Ask only when the answer can come back, and read the names from the
        space rosters otherwise (below) — which the server scopes to the spaces
        this viewer may see.
      */
      const canReadDirectory = user?.canManageUsers === true;

      // Single batch — locations now embed their member assignments, so there
      // is no per-location follow-up request (no N+1).
      const [, locationsRes, membersRes, entriesRes, breaksRes, pendingRes] = await Promise.all([
        loadTasks(),
        locationsApi.list().catch(() => [] as LocationWithMembers[]),
        canReadDirectory
          ? membersApi.list().catch(() => [] as OrgMember[])
          : Promise.resolve([] as OrgMember[]),
        // "Who's on the clock right now" — date-independent (open entries), so an
        // overnight shift that started before midnight still counts as on-duty.
        attendanceApi.getActiveEntries().catch(() => [] as TimeEntry[]),
        attendanceApi.getActiveBreaks().catch(() => [] as Array<{ userId: string }>),
        /*
          The one number the screen cannot derive from what it already has.

          Asked only when the viewer holds the permission the endpoint enforces
          — otherwise it is a guaranteed 403 on every load — and asked as a
          COUNT: page 1, limit 1, total from the envelope. A member without the
          grant never sees the row, so never pays for the request.
        */
        canReviewHours
          ? attendanceApi.countPendingApprovals().catch(() => 0)
          : Promise.resolve(0),
      ]);

      const assignmentMap: Record<string, string[]> = {};
      for (const loc of locationsRes || []) {
        assignmentMap[loc.id] = (loc.assignments || []).map((a) => a.userId);
      }

      // One batched request for every visible space, and only for the viewer
      // who has no directory to read — an admin already holds all these people.
      const rostersRes = canReadDirectory
        ? []
        : await locationsApi
            .getRosters((locationsRes || []).map((l) => l.id))
            .catch(() => [] as LocationAssignment[]);

      setLocations(locationsRes || []);
      setMembers(membersRes || []);
      setRosters(rostersRes || []);
      setEntries(entriesRes || []);
      setActiveBreaks(breaksRes || []);
      setPendingHours(pendingRes || 0);
      setAssignments(assignmentMap);
    } catch (err: any) {
      if (err?.statusCode === 401 || err?.message?.includes('Session expired')) return;
      setError(err instanceof Error ? err.message : t('tasks.failedToLoad'));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
      fetchingRef.current = false;
    }
  }, [t, user?.canManageUsers, canReviewHours, loadTasks]);

  useEffect(() => {
    if (initialFetchDoneRef.current) return;
    initialFetchDoneRef.current = true;
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      if (!initialFetchDoneRef.current) return;
      if (Date.now() - lastFetchTimeRef.current < 30000) return;
      load();
    }, [load]),
  );

  // ── Derived lookups ──────────────────────────────────────────────────────
  const memberMap = useMemo(() => {
    const map = new Map<string, OrgMember>();
    /*
      Rosters first, directory second: the roster carries a name, a face and
      nothing else, so a fuller record always wins where both exist. For a
      space-scoped viewer the roster is the only source there is — without it
      every person on their board was skipped as "unknown member".
    */
    for (const a of rosters) {
      if (a.user && !map.has(a.user.id)) {
        // `presenceUnknown` marks what this record cannot answer: the roster
        // carries no activity timestamp, so "are they reachable right now" has
        // no answer here — see how the off-the-clock groups read it.
        map.set(a.user.id, {
          ...a.user,
          isActive: true,
          role: 'EMPLOYEE',
          presenceUnknown: true,
        } as unknown as OrgMember);
      }
    }
    for (const m of members) map.set(m.id, m);
    return map;
  }, [members, rosters]);

  const clockedInUserIds = useMemo(() => {
    const set = new Set<string>();
    for (const e of entries) if (isClockedIn(e)) set.add(e.userId);
    return set;
  }, [entries]);

  const onBreakUserIds = useMemo(() => {
    const set = new Set<string>();
    for (const b of activeBreaks) if (b.userId) set.add(b.userId);
    return set;
  }, [activeBreaks]);

  const attendanceLocationMap = useMemo(() => {
    const map = new Map<string, string>();
    const sorted = [...entries].sort(
      (a, b) => new Date(b.clockInAt).getTime() - new Date(a.clockInAt).getTime(),
    );
    for (const e of sorted) if (!map.has(e.userId)) map.set(e.userId, e.locationId);
    return map;
  }, [entries]);

  // userId -> whether their current clock-in is remote (WFH). Drives Remote vs On Shift.
  const attendanceRemoteMap = useMemo(() => {
    const map = new Map<string, boolean>();
    const sorted = [...entries].sort(
      (a, b) => new Date(b.clockInAt).getTime() - new Date(a.clockInAt).getTime(),
    );
    for (const e of sorted) if (!map.has(e.userId)) map.set(e.userId, !!e.isRemote);
    return map;
  }, [entries]);

  const activeTaskMap = useMemo(() => {
    const map = new Map<string, Task>();
    for (const task of tasks) {
      const assignee = task.assignedToId;
      if (!assignee) continue;
      const p = ACTIVE_TASK_PRIORITY[task.status];
      if (p === undefined) continue;
      const existing = map.get(assignee);
      if (!existing || (ACTIVE_TASK_PRIORITY[existing.status] || 0) < p) map.set(assignee, task);
    }
    return map;
  }, [tasks]);

  /*
    Can this viewer see everybody, or only the spaces they hold?

    The FLAT columns, deliberately — they carry the ORG-wide resolution, which
    is exactly the question. `oversees(user)` cannot answer it: it is true of
    somebody who oversees ONE space, which is precisely who this restricts.
  */
  const viewerIsOrgWide = user?.canViewAllTasks === true || user?.canManageUsers === true;

  // ── Build workspace boxes ────────────────────────────────────────────────
  const boxes: WorkspaceBoxData[] = useMemo(() => {
    const result: WorkspaceBoxData[] = [];
    const accounted = new Set<string>();

    const toNode = (m: OrgMember, status: PersonNodeData['status'], tag?: PersonNodeData['tag']): PersonNodeData => ({
      userId: m.id,
      initials: getInitials(m.firstName, m.lastName),
      name: shortName(m.firstName, m.lastName),
      status,
      imageUrl: m.avatarUrl || undefined,
      tag,
    });

    // A clocked-in member is in ONE place: resolve their single active space (the
    // space they clocked in at if visible, else — remote/field clock-in — their
    // first assigned space). They're active there only; off-shift elsewhere.
    const visibleSpaceIds = new Set(locations.map((l) => l.id));
    const activeSpaceByUser = new Map<string, string>();
    for (const userId of clockedInUserIds) {
      const loc = attendanceLocationMap.get(userId);
      if (loc && visibleSpaceIds.has(loc)) {
        activeSpaceByUser.set(userId, loc);
      } else {
        for (const l of locations) {
          if ((assignments[l.id] || []).includes(userId)) { activeSpaceByUser.set(userId, l.id); break; }
        }
      }
    }
    const spaceNameById = new Map(locations.map((l) => [l.id, l.name]));

    for (const loc of locations) {
      if (!loc.isActive) continue;
      const assigned = assignments[loc.id] || [];

      const present: PersonNodeData[] = [];
      const onRoad: PersonNodeData[] = [];
      const remote: PersonNodeData[] = [];
      const offShift: PersonNodeData[] = [];
      const offDuty: PersonNodeData[] = [];

      for (const userId of assigned) {
        const m = memberMap.get(userId);
        if (!m || !m.isActive) continue;
        accounted.add(userId);

        const clocked = clockedInUserIds.has(userId);
        const online = memberOnline(m);
        const { status, tag } = getEmployeeStatus({
          isClockedIn: clocked,
          isOnBreak: onBreakUserIds.has(userId),
          isOnline: online,
          presence: m.presence,
          isRemote: attendanceRemoteMap.get(userId) ?? false,
          isOnRoad: isFieldWorker(m),
        });
        const node = toNode(m, status, tag);

        const activeSpace = activeSpaceByUser.get(userId);
        if (!clocked) {
          /*
            Off the clock → Off-shift (online/reachable) vs Off Duty (offline).

            Unless nobody told us: a roster gives a name and a face and no
            activity timestamp, so a viewer without the member directory knows
            only that these people are not on the clock. Reading that silence as
            "offline" put a whole space under Off Duty and asserted something
            the screen had no way to know. Not-on-the-clock is the honest half.
          */
          const activityUnknown = (m as { presenceUnknown?: boolean }).presenceUnknown === true;
          (online || activityUnknown ? offShift : offDuty).push(node);
        } else if (activeSpace !== loc.id) {
          // Clocked in, but active ELSEWHERE → off-shift here with a hint, not a
          // misleading active "off-site" node (and not double-counted).
          const whereName = activeSpace ? spaceNameById.get(activeSpace) : null;
          const hint = (attendanceRemoteMap.get(userId) ?? false)
            ? i18n.t('home.admin.presence.remote')
            : whereName
              ? i18n.t('home.admin.presence.atSpace', { space: whereName, defaultValue: 'At {{space}}' })
              : undefined;
          offShift.push(toNode(m, 'off', hint ? { text: hint, variant: 'hrs' } : undefined));
        } else if (isFieldWorker(m)) {
          onRoad.push(node);
        } else if (attendanceRemoteMap.get(userId)) {
          remote.push(node);
        } else {
          present.push(node);
        }
      }

      // Alert badge = blocked tasks at this location (clear & actionable).
      let alerts = 0;
      for (const task of tasks) {
        const atLoc = task.locationAddress?.includes(loc.name);
        if (!atLoc) continue;
        if (task.status === 'BLOCKED') alerts++;
      }

      result.push({
        locationId: loc.id,
        title: loc.name,
        type: 'fixed',
        people: present,
        onRoadPeople: onRoad,
        remotePeople: remote,
        offShiftPeople: offShift,
        offDutyPeople: offDuty,
        totalAssigned: assigned.length,
        activeCount: present.length + onRoad.length + remote.length,
        alerts,
      });
    }

    // "On Task" — workers with active tasks not tied to a location
    const onTask: PersonNodeData[] = [];
    for (const [userId, task] of activeTaskMap) {
      if (accounted.has(userId)) continue;
      const m = memberMap.get(userId);
      if (m) {
        accounted.add(userId);
        const { status, tag } = getEmployeeStatus({
          isClockedIn: clockedInUserIds.has(userId),
          isOnBreak: onBreakUserIds.has(userId),
          isOnline: memberOnline(m),
          presence: m.presence,
          isRemote: attendanceRemoteMap.get(userId) ?? false,
          isOnRoad: isFieldWorker(m),
        });
        onTask.push(toNode(m, status, tag));
      } else if (task.assignedTo && viewerIsOrgWide) {
        /*
          Nobody this viewer was given — so not their person.

          `memberMap` holds the rosters of the spaces the viewer can see. A
          name missing from it belongs to somebody working at a site they
          supervise while ROSTERED somewhere else: the task is theirs to see,
          the person is not. Falling back to the assignee embedded in the task
          put that person on the board anyway — a face, a status and a current
          job, assembled from somebody the viewer was never shown.

          An org-wide viewer keeps the fallback: their roster is everyone, so
          the only person it can add is somebody with no space at all, which is
          the case it was written for.
        */
        onTask.push({
          userId: task.assignedTo.id,
          initials: getInitials(task.assignedTo.firstName, task.assignedTo.lastName),
          name: shortName(task.assignedTo.firstName, task.assignedTo.lastName),
          status: 'busy',
          imageUrl: task.assignedTo.avatarUrl || undefined,
          tag: { text: i18n.t('home.admin.presence.working'), variant: 'task' },
        });
      }
    }
    if (onTask.length > 0) {
      result.push({ locationId: 'on-task', title: i18n.t('home.admin.presence.onTask'), type: 'dynamic', people: onTask });
    }

    // Catch-all for anyone NOT already placed:
    //  • clocked in → "On the Clock" (so a clocked-in driver is never invisible)
    //  • off the clock → "Off-shift" (online) vs "Off Duty" (offline)
    const onClock: PersonNodeData[] = [];
    const offShiftDyn: PersonNodeData[] = [];
    const offDutyDyn: PersonNodeData[] = [];
    for (const m of memberMap.values()) {
      if (accounted.has(m.id)) continue;
      if (!m.isActive) continue;
      const clocked = clockedInUserIds.has(m.id);
      // Employees are always part of presence; admins/owners appear only when
      // they're actually on the clock (a working owner) — never as idle
      // "off duty" clutter.
      if (m.role !== 'EMPLOYEE' && !clocked) continue;
      const online = memberOnline(m);

      if (clocked) {
        accounted.add(m.id);
        const { status, tag } = getEmployeeStatus({
          isClockedIn: true,
          isOnBreak: onBreakUserIds.has(m.id),
          isOnline: online,
          presence: m.presence,
          isRemote: attendanceRemoteMap.get(m.id) ?? false,
          isOnRoad: isFieldWorker(m),
        });
        onClock.push(toNode(m, status, tag));
      } else if (!activeTaskMap.has(m.id)) {
        accounted.add(m.id);
        const { status, tag } = getEmployeeStatus({
          isClockedIn: false,
          isOnBreak: false,
          isOnline: online,
          presence: m.presence,
        });
        (online ? offShiftDyn : offDutyDyn).push(toNode(m, status, tag));
      }
    }
    if (onClock.length > 0) {
      result.push({ locationId: 'on-clock', title: i18n.t('home.admin.presence.onTheClock'), type: 'dynamic', people: onClock });
    }
    if (offShiftDyn.length > 0) {
      result.push({ locationId: 'off-shift', title: i18n.t('home.admin.presence.offShift'), type: 'dynamic', people: offShiftDyn });
    }
    if (offDutyDyn.length > 0) {
      result.push({ locationId: 'off-duty', title: i18n.t('home.admin.presence.offDuty'), type: 'dynamic', people: offDutyDyn });
    }

    return result;
  }, [
    locations, assignments, tasks, memberMap,
    clockedInUserIds, onBreakUserIds, attendanceLocationMap, attendanceRemoteMap, activeTaskMap, memberOnline,
    viewerIsOrgWide, i18n.language,
  ]);

  /*
    The site in three numbers, all derived from what is already loaded.

    `total` is the people rostered in the spaces this viewer was given, so the
    denominator is their site rather than the company; `onShift` counts the
    clocked-in among exactly those people, which is why an admin's number covers
    everywhere and a supervisor's covers one place, with no branch here saying
    so. Nothing is fetched for any of it.
  */
  const pulse = useMemo(() => {
    const rostered = new Set<string>();
    for (const loc of locations) {
      if (!loc.isActive) continue;
      for (const id of assignments[loc.id] || []) rostered.add(id);
    }
    // A viewer with attendance but no roster (possible: the grants are separate)
    // still gets a truthful bar from the people actually on the clock.
    if (rostered.size === 0) for (const id of clockedInUserIds) rostered.add(id);

    let onShift = 0;
    for (const id of rostered) if (clockedInUserIds.has(id)) onShift++;

    return { total: rostered.size, onShift, rostered };
  }, [locations, assignments, clockedInUserIds, entries]);

  /*
    What the number MEANS, said in one line.

    Deliberately not "last person out at 16:31": the active-entries feed carries
    only OPEN shifts, so that sentence would need a second query over today's
    whole attendance to say something nobody asked for. The screen states what
    it actually knows.
  */
  const pulseCaption = useMemo(
    () =>
      pulse.onShift > 0
        ? i18n.t('home.pulse.working', { count: pulse.onShift })
        : i18n.t('home.pulse.nobodyIn'),
    [pulse.onShift, i18n.language],
  );

  /** The crew line: the rostered people, marked by who is on the clock. */
  const crew: CrewMember[] = useMemo(() => {
    const out: CrewMember[] = [];
    for (const id of pulse.rostered) {
      const m = memberMap.get(id);
      if (!m || m.isActive === false) continue;
      out.push({
        userId: m.id,
        initials: getInitials(m.firstName, m.lastName),
        imageUrl: m.avatarUrl || undefined,
        onShift: clockedInUserIds.has(m.id),
      });
    }
    return out;
  }, [pulse.rostered, memberMap, clockedInUserIds]);

  // ── Live events ──────────────────────────────────────────────────────────
  const liveEvents: LiveEvent[] = useMemo(() => {
    const events: LiveEvent[] = [];
    const sortedTasks = [...tasks]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 10);
    for (const task of sortedTasks) {
      const a = task.assignedTo;
      events.push({
        id: `task-${task.id}`,
        dot: STATUS_DOT[task.status] || 'blue',
        name: a ? shortName(a.firstName, a.lastName) : i18n.t('home.admin.activity.someone'),
        action: i18n.t(STATUS_ACTION[task.status] || 'home.admin.activity.actions.updated'),
        subject: task.title,
        time: timeAgo(task.updatedAt),
      });
    }
    const recentClockIns = [...entries]
      .sort((a, b) => new Date(b.clockInAt).getTime() - new Date(a.clockInAt).getTime())
      .slice(0, 5);
    for (const e of recentClockIns) {
      const m = memberMap.get(e.userId);
      const name = m ? shortName(m.firstName, m.lastName) : i18n.t('home.admin.activity.someone');
      const locName = (e as any).location?.name || i18n.t('home.admin.activity.aLocation');
      if (isClockedIn(e)) {
        events.push({ id: `in-${e.id}`, dot: 'green', name, action: i18n.t('home.admin.activity.clockedInAt'), subject: locName, time: timeAgo(e.clockInAt) });
      } else if (e.clockOutAt) {
        events.push({ id: `out-${e.id}`, dot: 'blue', name, action: i18n.t('home.admin.activity.clockedOutFrom'), subject: locName, time: timeAgo(e.clockOutAt) });
      }
    }
    return events.slice(0, 12);
  }, [tasks, entries, memberMap, i18n.language]);

  /*
    What is waiting, in the order it deserves attention.

    Assembled rather than hard-coded so a row can only exist when its permission
    AND its count both allow it: hours need `canViewSpaceAttendance`, the job
    rows need tasks the viewer can already see. A member with one grant gets one
    row, and the list says "all clear" instead of showing three zeros.
  */
  const needs: NeedItem[] = useMemo(() => {
    /*
      Plurals are chosen here, not by i18next.

      The app's Hermes runtime does not carry `Intl.PluralRules`, so the whole
      codebase pairs a key with a `…Plural` sibling and picks between them —
      `tasks.taskCount` does it, and a lone screen relying on suffix plurals
      would silently render the singular to everybody.
    */
    const plural = (key: string, count: number, params: Record<string, unknown> = {}) =>
      i18n.t(count === 1 ? key : `${key}Plural`, { count, ...params });
    const out: NeedItem[] = [];
    const blocked = tasks.filter((tk) => tk.status === TaskStatus.BLOCKED);
    const open = tasks.filter(
      (tk) => ![TaskStatus.COMPLETED, TaskStatus.CLOSED, TaskStatus.CANCELED].includes(tk.status as never),
    ).length;
    const doneToday = tasks.filter(
      (tk) =>
        (tk.status === TaskStatus.COMPLETED || tk.status === TaskStatus.CLOSED) &&
        isToday(tk.updatedAt),
    ).length;

    if (blocked.length > 0) {
      const first = blocked[0];
      out.push({
        key: 'blocked',
        glyph: 'blocked',
        tone: 'urgent',
        title: plural('home.needs.blocked', blocked.length),
        detail: first?.title,
        count: blocked.length,
        onPress: () =>
          blocked.length === 1 && first
            ? router.push(ROUTES.taskDetail(first.id) as never)
            : router.push(ROUTES.tasks as never),
      });
    }

    if (canReviewHours && pendingHours > 0) {
      out.push({
        key: 'hours',
        glyph: 'approve',
        tone: 'attention',
        title: plural('home.needs.hours', pendingHours),
        detail: i18n.t('home.needs.hoursDetail'),
        count: pendingHours,
        onPress: () => router.push('/(app)/manage/attendance' as never),
      });
    }

    /*
      Activity, as a row rather than a floating button.

      It used to be a purple circle hovering over the screen with a count on it,
      which is where the important things were hidden — the whole reason the
      dashboard read as empty. Nothing is lost: the same sheet opens, from a
      line that says what last happened.
    */
    if (liveEvents.length > 0) {
      const latest = liveEvents[0];
      out.push({
        key: 'activity',
        glyph: 'activity',
        tone: 'neutral',
        title: i18n.t('home.needs.activity'),
        detail: latest ? `${latest.name} ${latest.action} · ${latest.time}` : undefined,
        onPress: () => setActivityOpen(true),
      });
    }

    if (open > 0) {
      out.push({
        key: 'jobs',
        glyph: 'openJobs',
        tone: 'neutral',
        title: plural('home.needs.openJobs', open),
        detail: doneToday > 0 ? i18n.t('home.needs.doneToday', { count: doneToday }) : undefined,
        count: open,
        onPress: () => router.push(ROUTES.tasks as never),
      });
    }
    return out;
  }, [tasks, canReviewHours, pendingHours, liveEvents, i18n.language]);

  /*
    Which site this screen is about.

    One space names itself; several are counted, because a supervisor's screen
    and an owner's are the same screen and only the scope differs.
  */
  const siteTitle = useMemo(() => {
    const active = locations.filter((l) => l.isActive);
    if (active.length === 1) return active[0]?.name ?? '';
    if (active.length === 0) return i18n.t('home.pulse.yourWork');
    return i18n.t('home.pulse.sites', { count: active.length });
  }, [locations, i18n.language]);

  const openTeam = useCallback(() => router.push('/(app)/(tabs)/team' as never), []);

  // ── Pending actions ──────────────────────────────────────────────────────
  const pending: PendingActionItem[] = useMemo(() => {
    const actions: PendingActionItem[] = [];
    for (const task of tasks.filter((x) => x.status === 'BLOCKED').slice(0, 3)) {
      const a = task.assignedTo;
      actions.push({
        id: `blocked-${task.id}`,
        userId: a?.id,
        initials: a ? getInitials(a.firstName, a.lastName) : '?',
        imageUrl: a?.avatarUrl || undefined,
        title: `${a ? shortName(a.firstName, a.lastName) : i18n.t('home.admin.pending.unassigned')} – ${i18n.t('home.admin.pending.blocked')}`,
        description: task.title,
        taskId: task.id,
      });
    }
    for (const task of tasks.filter((x) => x.status === 'NEW' && !x.assignedToId).slice(0, 3)) {
      actions.push({
        id: `new-${task.id}`,
        initials: '?',
        title: i18n.t('home.admin.pending.unassignedNewTask'),
        description: task.title,
        taskId: task.id,
      });
    }
    return actions.slice(0, 5);
  }, [tasks, i18n.language]);

  /*
    Two columns is a layout for a wall of spaces, not for one.

    A member who supervises a single site got that site as a half-width card
    with the whole right half of the screen empty beside it, and its roster
    squeezed two faces to a row so it ran off the bottom. The grid earns its
    second column from the second card.
  */
  const columns = useMemo(() => splitColumns(boxes), [boxes]);
  const isSingleCard = boxes.length === 1;

  // ── Handlers ─────────────────────────────────────────────────────────────
  const greeting = useMemo(() => {
    const h = new Date().getHours();
    return h < 12 ? t('common.greeting.morning') : h < 18 ? t('common.greeting.afternoon') : t('common.greeting.evening');
  }, [t]);

  // Tapping a person opens an in-place detail sheet (not a navigation away).
  const handlePersonPress = useCallback((userId: string) => {
    setSelectedMemberId(userId);
  }, []);
  const handleViewTasks = useCallback(() => {
    setSelectedMemberId(null);
    router.push(ROUTES.tasks as any);
  }, []);
  const handleOpenTask = useCallback((taskId: string) => {
    setActivityOpen(false);
    setSelectedMemberId(null);
    router.push(ROUTES.taskDetail(taskId) as any);
  }, []);
  const handleMemberProfile = useCallback(() => {
    setSelectedMemberId(null);
    router.push('/(app)/manage/members' as any);
  }, []);

  // One card, rendered by both layouts — a full-width card differs from a
  // masonry cell only in how much room it is given.
  const renderCard = useCallback(
    (box: WorkspaceBoxData, compact: boolean) => (
      <WorkspaceCard
        key={`${box.type}-${box.locationId}`}
        box={box}
        compact={compact}
        onPersonPress={handlePersonPress}
        /*
          Assigning somebody to a space is `@RequirePermissionInSpace
          ('canManageWorkspaces')`. A supervisor who oversees one site holds no
          such thing, so the button led straight to a refusal — no handler, no
          button.
        */
        onAssign={canManageMembersInSpace(user, box.locationId) ? setAssignLocationId : undefined}
        onViewTasks={handleViewTasks}
      />
    ),
    [handlePersonPress, handleViewTasks, user],
  );

  const assignLocationName = useMemo(
    () => locations.find((l) => l.id === assignLocationId)?.name,
    [locations, assignLocationId],
  );
  const assignedUserIdsForLocation = useMemo(
    () => new Set(assignLocationId ? assignments[assignLocationId] || [] : []),
    [assignments, assignLocationId],
  );

  // Selected member detail (name/avatar/status from loaded data) + their active
  // tasks derived from already-loaded tasks — only stats are fetched in the sheet.
  const selectedMember = useMemo<MemberSummary | null>(() => {
    if (!selectedMemberId) return null;
    const m = memberMap.get(selectedMemberId);
    if (!m) return null;
    const { status } = getEmployeeStatus({
      isClockedIn: clockedInUserIds.has(m.id),
      isOnBreak: onBreakUserIds.has(m.id),
      isOnline: memberOnline(m),
      presence: m.presence,
      isRemote: attendanceRemoteMap.get(m.id) ?? false,
      isOnRoad: isFieldWorker(m),
    });
    return {
      userId: m.id,
      name: shortName(m.firstName, m.lastName),
      initials: getInitials(m.firstName, m.lastName),
      imageUrl: m.avatarUrl || undefined,
      position: m.position,
      email: m.email,
      status,
    };
  }, [selectedMemberId, memberMap, clockedInUserIds, onBreakUserIds, attendanceRemoteMap, memberOnline]);

  const selectedMemberTasks = useMemo(() => {
    if (!selectedMemberId) return [];
    const ACTIVE = ['IN_PROGRESS', 'EN_ROUTE', 'ARRIVED', 'BLOCKED', 'ASSIGNED', 'ACCEPTED'];
    return tasks.filter((tk) => tk.assignedToId === selectedMemberId && ACTIVE.includes(tk.status));
  }, [selectedMemberId, tasks]);


  // Admin/owner clock control + their own out-of-ring state. These hooks MUST
  // run on every render — i.e. BEFORE the isLoading/error early returns below —
  // or React throws "rendered more hooks than during the previous render".
  const canClock = hasAccessModule(user || {}, 'clock');
  const myClockedIn = !!user && clockedInUserIds.has(user.id);
  const [myExcursion, setMyExcursion] = useState<GeofenceExcursion | null>(null);
  const [myEntryLocation, setMyEntryLocation] = useState<Partial<CompanyLocation> | null>(null);
  const refreshMyStatus = useCallback(async () => {
    if (!canClock) return;
    try {
      const s = await attendanceApi.getStatus();
      setMyExcursion(s?.activeExcursion ?? null);
      setMyEntryLocation((s?.currentEntry?.location as Partial<CompanyLocation>) ?? null);
    } catch {
      // best-effort
    }
  }, [canClock]);
  useEffect(() => {
    refreshMyStatus();
  }, [refreshMyStatus, myClockedIn]);
  useExcursionSync(refreshMyStatus, user?.id);

  // ── Render ───────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <View style={[homeStyles.container, { backgroundColor: colors.surface }]}>
        <Skeleton.Dashboard />
      </View>
    );
  }
  if (error) return <ErrorState message={error} onRetry={() => load()} />;

  const hasFixed = boxes.some((b) => b.type === 'fixed');

  return (
    <View style={[homeStyles.container, { backgroundColor: colors.surface }]}>
      <ScreenContainer width="content">
      <ScrollView
        // Lets the guided tour scroll a target into view before spotlighting it.
        {...tourScroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => load(true)}
            colors={[COLORS.primary]}
            tintColor={COLORS.primary}
          />
        }
      >
        {/*
          Header, compressed to two short lines.

          The greeting used to take the top of the screen at 22px and say
          nothing about the work; the number below now owns that space. The
          person keeps their name, and gains the one fact the old header never
          gave them — WHICH site they are looking at.
        */}
        {/* What the network means right now — the same line the Tasks tab and
            the task screen carry, in the same place. Quiet when online with
            nothing waiting, which is the normal case. */}
        <OfflineBanner style={styles.offlineBanner} />

        <TourTarget name="home-greeting" style={styles.header}>
          <Text style={[styles.greeting, { color: colors.textMuted }]}>
            {t('home.admin.greetingLine', { greeting, name: user?.firstName ?? '' })}
          </Text>
          <Text style={[styles.siteName, { color: colors.textPrimary }]} numberOfLines={1}>
            {siteTitle}
          </Text>
          {/* When the board's jobs were last brought up to date — shown only
              while they are being read from this phone. */}
          {tasksUpdatedAt !== null && <FreshnessLabel at={tasksUpdatedAt} />}
        </TourTarget>

        {/* How the site is doing, and what is waiting on this person — the two
            questions the screen used to answer with a roster and a gap. */}
        <View style={styles.section}>
          <SitePulse total={pulse.total} onShift={pulse.onShift} caption={pulseCaption} />
          <NeedsList items={needs} />
        </View>

        {/* The personal doors, directly under what is waiting on this person.
            An owner holds no van and sends no page in, so two of the five
            tiles simply never build — see quick-actions.tsx. */}
        <QuickActions />

        {/*
          Outstanding personal documents. Renders nothing when there are none,
          which is the normal case.

          ⚠️ The spacer carries a TOP MARGIN ONLY. These cards inset themselves
          horizontally (homeStyles.actionCard, and the clock card's own
          marginHorizontal), so a wrapper with padding double-insets them — 32px
          against their neighbours' 16 — which is exactly what a previous
          attempt at this did.
        */}
        <View style={styles.blockGap}>
          <DocumentsReminderCard />
        </View>

        {/* Clock in/out — the same self-contained shift widget members use, for a
            working admin/owner (gated on the clock module).

            No margin of its own: the documents card above already ends with
            one, and in React Native adjacent margins STACK rather than collapse.
            Adding a second here is what made this the one 60px gap on a screen
            whose rhythm is 24. */}
        {canClock && <ShiftClockCard onChanged={refreshMyStatus} />}

        {/* Admin's own out-of-ring state + Always-location nudge */}
        {canClock && (
          <View style={{ marginTop: SPACING.md }}>
            <OutOfRingHomeBanner
              excursion={myExcursion}
              onPress={() => router.push(ROUTES.attendance as any)}
            />
            <AlwaysLocationNudge active={myClockedIn && myEntryLocation?.lat != null} />
          </View>
        )}

        {/* Workspace cards */}
        <TourTarget name="home-work" style={styles.grid}>
          {boxes.length === 0 || !hasFixed ? (
            <View style={[styles.emptyState, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Ionicons name="business-outline" size={32} color={colors.textMuted} />
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>{t('home.admin.setUpWorkspace')}</Text>
              <Text style={[styles.emptySub, { color: colors.textMuted }]}>
                {t('home.admin.setUpWorkspaceSub')}
              </Text>
            </View>
          ) : (
            isSingleCard ? (
              /*
                One space needs no card around it.

                The card's header repeats the site name already in the pulse
                above, and its roster repeats the crew line below — so a
                supervisor's whole screen was one box saying things twice. With
                several spaces the grid still earns its keep.
              */
              <CrewLine people={crew} onPress={openTeam} />
            ) : (
            <View style={styles.columns}>
              {columns.map((column, ci) => (
                <View key={`col-${ci}`} style={styles.column}>
                  {column.map((box) => renderCard(box, true))}
                </View>
              ))}
            </View>
            )
          )}
        </TourTarget>
      </ScrollView>
      </ScreenContainer>


      <ActivitySheet
        visible={activityOpen}
        onClose={() => setActivityOpen(false)}
        events={liveEvents}
        pending={pending}
        onOpenTask={handleOpenTask}
      />

      <AssignMemberSheet
        visible={!!assignLocationId}
        locationId={assignLocationId}
        locationName={assignLocationName}
        members={members}
        assignedUserIds={assignedUserIdsForLocation}
        onClose={() => setAssignLocationId(null)}
        onAssigned={() => load(true)}
      />

      <MemberDetailSheet
        visible={!!selectedMember}
        member={selectedMember}
        activeTasks={selectedMemberTasks}
        onClose={() => setSelectedMemberId(null)}
        onOpenTask={handleOpenTask}
        onViewTasks={handleViewTasks}
        onProfile={handleMemberProfile}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  offlineBanner: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
  },
  header: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.sm,
  },
  greeting: { fontSize: 12, fontWeight: '500' },
  // The gutter the header already uses, so the number lines up with the name.
  section: { paddingHorizontal: SPACING.lg },
  // Vertical only — see the note at the documents card.
  blockGap: { marginTop: SPACING.md },
  siteName: {
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: -0.4,
    marginTop: 1,
  },
  welcome: { fontSize: 21, fontWeight: '700', marginTop: 2 },
  grid: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm },
  columns: { flexDirection: 'row', alignItems: 'flex-start', gap: GRID_GAP },
  column: { flex: 1 },
  emptyState: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 28,
    alignItems: 'center',
    gap: 8,
    marginTop: SPACING.md,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', marginTop: 4 },
  emptySub: { fontSize: 13, textAlign: 'center', lineHeight: 19 },
});
