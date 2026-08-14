import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Dimensions,
  Animated,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/auth-context';
import { useTheme } from '../../contexts/theme-context';
import {
  tasksApi,
  locationsApi,
  attendanceApi,
  membersApi,
  type Task,
  type OrgMember,
  type LocationWithMembers,
} from '../../lib/api';
import type { TimeEntry } from '../../lib/api/types';
import { ErrorState, Skeleton, ScreenContainer } from '../../components';
import { OutOfRingHomeBanner } from '../out-of-ring-home-banner';
import { AlwaysLocationNudge } from '../always-location-nudge';
import { useExcursionSync } from '../../hooks/useExcursionSync';
import type { GeofenceExcursion, CompanyLocation } from '../../lib/api/types';
import { TourTarget } from '../tour';
import { ROUTES } from '../../lib/constants';
import { hasAccessModule, isFieldWorker } from '@hbcfield/shared/client';
import { styles as homeStyles, SPACING, COLORS } from './home-styles';
import { WorkspaceCard, type WorkspaceBoxData } from './workspace/workspace-card';
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

  // The viewer is online by definition (they're on this screen right now) — never
  // let their own lastActiveAt lag drop them into "Off Duty".
  const memberOnline = useCallback(
    (m: { id: string; lastActiveAt?: string | null }) => m.id === user?.id || isOnline(m.lastActiveAt),
    [user?.id],
  );

  const [tasks, setTasks] = useState<Task[]>([]);
  const [locations, setLocations] = useState<LocationWithMembers[]>([]);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [activeBreaks, setActiveBreaks] = useState<Array<{ userId: string }>>([]);
  const [assignments, setAssignments] = useState<Record<string, string[]>>({});

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

      // Single batch — locations now embed their member assignments, so there
      // is no per-location follow-up request (no N+1).
      const [tasksRes, locationsRes, membersRes, entriesRes, breaksRes] = await Promise.all([
        tasksApi.list(),
        locationsApi.list().catch(() => [] as LocationWithMembers[]),
        membersApi.list().catch(() => [] as OrgMember[]),
        // "Who's on the clock right now" — date-independent (open entries), so an
        // overnight shift that started before midnight still counts as on-duty.
        attendanceApi.getActiveEntries().catch(() => [] as TimeEntry[]),
        attendanceApi.getActiveBreaks().catch(() => [] as Array<{ userId: string }>),
      ]);

      const assignmentMap: Record<string, string[]> = {};
      for (const loc of locationsRes || []) {
        assignmentMap[loc.id] = (loc.assignments || []).map((a) => a.userId);
      }

      setTasks(tasksRes || []);
      setLocations(locationsRes || []);
      setMembers(membersRes || []);
      setEntries(entriesRes || []);
      setActiveBreaks(breaksRes || []);
      setAssignments(assignmentMap);
    } catch (err: any) {
      if (err?.statusCode === 401 || err?.message?.includes('Session expired')) return;
      setError(err instanceof Error ? err.message : t('tasks.failedToLoad'));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
      fetchingRef.current = false;
    }
  }, [t]);

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
    for (const m of members) map.set(m.id, m);
    return map;
  }, [members]);

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
          // Off the clock → Off-shift (online/reachable) vs Off Duty (offline).
          (online ? offShift : offDuty).push(node);
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
      } else if (task.assignedTo) {
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
    i18n.language,
  ]);

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

  const columns = useMemo(() => splitColumns(boxes), [boxes]);

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

  // Activity FAB: slide it out of the way while the list is scrolling (so it
  // never sits on top of a card's action row), and bring it back when the user
  // stops or scrolls up. 1 = shown, 0 = hidden. NOTE: these hooks MUST stay
  // above the early returns below (Rules of Hooks — same hook order every render).
  const fabAnim = useRef(new Animated.Value(1)).current;
  const lastScrollY = useRef(0);
  const setFab = useCallback((toValue: number) => {
    Animated.timing(fabAnim, { toValue, duration: 180, useNativeDriver: true }).start();
  }, [fabAnim]);
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const dy = y - lastScrollY.current;
    if (dy > 6 && y > 40) setFab(0);        // scrolling down → hide
    else if (dy < -6) setFab(1);            // scrolling up → reveal
    lastScrollY.current = y;
  }, [setFab]);
  const fabTranslate = fabAnim.interpolate({ inputRange: [0, 1], outputRange: [96, 0] });

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
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
        scrollEventThrottle={16}
        onScroll={onScroll}
        onScrollEndDrag={() => setFab(1)}
        onMomentumScrollEnd={() => setFab(1)}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => load(true)}
            colors={[COLORS.primary]}
            tintColor={COLORS.primary}
          />
        }
      >
        {/* Header */}
        <TourTarget name="home-greeting" style={styles.header}>
          <Text style={[styles.greeting, { color: colors.textMuted }]}>{greeting}</Text>
          <Text style={[styles.welcome, { color: colors.textPrimary }]}>
            {t('home.admin.welcomeBack', { name: user?.firstName })}
          </Text>
        </TourTarget>

        {/* Clock in/out — visible control for a working admin/owner. */}
        {canClock && (
          <TouchableOpacity
            onPress={() => router.push(ROUTES.attendance as any)}
            activeOpacity={0.85}
            style={[
              styles.clockButton,
              myClockedIn
                ? { backgroundColor: colors.card, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth }
                : { backgroundColor: COLORS.primary },
            ]}
          >
            <Ionicons
              name={myClockedIn ? 'time' : 'log-in-outline'}
              size={18}
              color={myClockedIn ? COLORS.primary : '#fff'}
            />
            <Text style={[styles.clockButtonText, { color: myClockedIn ? colors.textPrimary : '#fff' }]}>
              {myClockedIn ? t('home.admin.clock.onTheClock') : t('home.admin.clock.clockIn')}
            </Text>
            <Ionicons
              name="chevron-forward"
              size={16}
              color={myClockedIn ? colors.textMuted : 'rgba(255,255,255,0.85)'}
              style={{ marginLeft: 'auto' }}
            />
          </TouchableOpacity>
        )}

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
            <View style={styles.columns}>
              {columns.map((column, ci) => (
                <View key={`col-${ci}`} style={styles.column}>
                  {column.map((box) => (
                    <WorkspaceCard
                      key={`${box.type}-${box.locationId}`}
                      box={box}
                      compact
                      onPersonPress={handlePersonPress}
                      onAssign={setAssignLocationId}
                      onViewTasks={handleViewTasks}
                    />
                  ))}
                </View>
              ))}
            </View>
          )}
        </TourTarget>
      </ScrollView>
      </ScreenContainer>

      {/* Activity FAB — compact circular button; slides away while scrolling */}
      <Animated.View
        style={[styles.fabWrap, { opacity: fabAnim, transform: [{ translateX: fabTranslate }] }]}
        pointerEvents="box-none"
      >
        <TouchableOpacity
          onPress={() => setActivityOpen(true)}
          activeOpacity={0.9}
          accessibilityLabel={t('home.admin.activityLabel')}
        >
          <LinearGradient
            colors={['#6366f1', '#8b5cf6', '#a855f7']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.fab}
          >
            <Ionicons name="flash" size={22} color="#fff" />
          </LinearGradient>
          {pending.length > 0 && (
            <View style={styles.fabBadge}>
              <Text style={styles.fabBadgeText}>{pending.length}</Text>
            </View>
          )}
        </TouchableOpacity>
      </Animated.View>

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
  header: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.sm,
  },
  greeting: { fontSize: 12, fontWeight: '500' },
  welcome: { fontSize: 21, fontWeight: '700', marginTop: 2 },
  clockButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.sm,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
  },
  clockButtonText: { fontSize: 14, fontWeight: '600' },
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
  fabWrap: {
    position: 'absolute',
    right: 18,
    bottom: 24,
    shadowColor: '#7c3aed',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 10,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#f59e0b',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    borderWidth: 2,
    borderColor: '#fff',
  },
  fabBadgeText: { color: '#1a1a24', fontSize: 10, fontWeight: '800' },
});
