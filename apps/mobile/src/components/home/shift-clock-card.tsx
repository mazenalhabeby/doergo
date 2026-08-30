import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/auth-context';
import { useTheme } from '../../contexts/theme-context';
import { useToast } from '../../contexts/toast-context';
import {
  attendanceApi,
  type AttendanceStatus,
  type BreakStatus,
} from '../../lib/api';
import { LocationPickerSheet, ClockOutSheet } from '../../components';
import { WorkLogSheet } from '../worklog-sheet';
import { ReportIssueSheet, ShiftIssueThreadSheet, ShiftIssueListSheet } from '../shift-issue-sheet';
import { useClockIn } from '../../hooks/useClockIn';
import { stopBackgroundHeartbeat } from '../../services/background-heartbeat';
import { stopGeofence } from '../../services/background-geofence';
import { formatDurationMinutes as formatDuration } from '../../lib/utils';
import { styles as homeStyles, COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT, SHADOWS } from './home-styles';

/**
 * Self-contained "shift clock" widget — the member clock-in/clock-out card plus
 * its Activity / Report-an-issue / My-issues sheets. Owns its own attendance +
 * break status, elapsed timer, clock-in (via useClockIn) and clock-out flows, so
 * a consumer just renders <ShiftClockCard /> with no required props. Used on the
 * admin dashboard and both member home screens (DRY).
 *
 * @param onChanged Called after a successful clock in / clock out so a parent
 *                  screen can refresh its own data.
 * @param style     Optional style applied to the card root.
 */
export function ShiftClockCard({
  onChanged,
  style,
}: {
  onChanged?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const toast = useToast();

  const [attendanceStatus, setAttendanceStatus] = useState<AttendanceStatus | null>(null);
  const [breakStatus, setBreakStatus] = useState<BreakStatus | null>(null);
  const [elapsedMinutes, setElapsedMinutes] = useState(0);

  const [isClockLoading, setIsClockLoading] = useState(false);
  const [showClockOutConfirm, setShowClockOutConfirm] = useState(false);
  const [worklogOpen, setWorklogOpen] = useState(false);
  const [reportIssueOpen, setReportIssueOpen] = useState(false);
  const [issueThreadId, setIssueThreadId] = useState<string | null>(null);
  const [issueListOpen, setIssueListOpen] = useState(false);

  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;

  // ── Data fetching ──────────────────────────────────────────────────
  const fetchStatus = useCallback(async () => {
    const [statusData, breakData] = await Promise.all([
      attendanceApi.getStatus().catch(() => null),
      attendanceApi.getBreakStatus().catch(() => null),
    ]);
    if (statusData) setAttendanceStatus(statusData);
    if (breakData) setBreakStatus(breakData);
    if (statusData?.isClockedIn && statusData?.currentEntry) {
      const clockInTime = new Date(statusData.currentEntry.clockInAt).getTime();
      setElapsedMinutes(Math.floor((Date.now() - clockInTime) / 60000));
    } else {
      setElapsedMinutes(0);
    }
  }, []);

  // Initial load
  const initialFetchDoneRef = useRef(false);
  useEffect(() => {
    if (initialFetchDoneRef.current) return;
    initialFetchDoneRef.current = true;
    fetchStatus();
  }, [fetchStatus]);

  // Refetch on focus
  useFocusEffect(
    useCallback(() => {
      fetchStatus();
    }, [fetchStatus])
  );

  // Update elapsed time every minute
  useEffect(() => {
    if (!attendanceStatus?.isClockedIn || !attendanceStatus?.currentEntry) return;
    const interval = setInterval(() => {
      const clockInTime = new Date(attendanceStatus.currentEntry!.clockInAt).getTime();
      setElapsedMinutes(Math.floor((Date.now() - clockInTime) / 60000));
    }, 60000);
    return () => clearInterval(interval);
  }, [attendanceStatus?.isClockedIn, attendanceStatus?.currentEntry]);

  // Shared clock-in flow (GPS + location/remote picker) — one implementation
  // across the attendance tab and both home screens, so allowRemote members get
  // the "Work remotely" choice everywhere. (DRY)
  const clockIn = useClockIn({
    assignedLocations: attendanceStatus?.assignedLocations || [],
    onClockedIn: () => {
      fetchStatus();
      onChangedRef.current?.();
    },
  });

  // ── Clock out ──────────────────────────────────────────────────────
  const handleClockOut = () => {
    setShowClockOutConfirm(true);
  };

  const confirmClockOut = async (notes: string) => {
    setShowClockOutConfirm(false);
    setIsClockLoading(true);
    try {
      const location = await clockIn.getCurrentLocation();
      if (!location) { setIsClockLoading(false); return; }
      await attendanceApi.clockOut({ lat: location.lat, lng: location.lng, accuracy: location.accuracy, notes: notes || undefined });
      await stopBackgroundHeartbeat();
      await stopGeofence();
      await fetchStatus();
      onChangedRef.current?.();
    } catch (err: any) {
      toast.error(t('common.error'), err.message || t('home.fullTime.failedToClockOut'));
    } finally {
      setIsClockLoading(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────
  const isClockedIn = attendanceStatus?.isClockedIn || false;

  return (
    <>
      {isClockedIn ? (
        <View style={[cStyles.attendanceCard, cStyles.attendanceCardActive, style]}>
          <View style={cStyles.attendanceRow}>
            <View style={cStyles.attendanceLeft}>
              <View style={[cStyles.statusDot, cStyles.dotActive]} />
              <View>
                <Text style={[cStyles.attendanceStatus, { color: COLORS.white }]}>
                  {t('home.fullTime.clockedIn')}
                </Text>
                {attendanceStatus?.currentEntry && (
                  <Text style={cStyles.attendanceDetail}>
                    {attendanceStatus.currentEntry.location?.name || ''} · {formatDuration(elapsedMinutes)}
                    {breakStatus?.isOnBreak === true ? ` · ☕ ${t('home.fullTime.onBreak')}` : ''}
                  </Text>
                )}
              </View>
            </View>
            <TouchableOpacity
              style={[cStyles.clockBtn, cStyles.clockOutBtn]}
              onPress={handleClockOut}
              disabled={isClockLoading || clockIn.isBusy}
            >
              {isClockLoading || clockIn.isBusy ? (
                <ActivityIndicator size="small" color={COLORS.white} />
              ) : (
                <>
                  <Ionicons name="log-out" size={16} color={COLORS.white} />
                  <Text style={cStyles.clockBtnText}>{t('home.fullTime.clockOut')}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
          {attendanceStatus?.currentEntry?.id && (
            <TouchableOpacity
              style={cStyles.translucentBtn}
              onPress={() => setWorklogOpen(true)}
            >
              <Ionicons name="list-outline" size={16} color={COLORS.white} />
              <Text style={cStyles.clockBtnText}>{t('worklog.button', 'Activity')}</Text>
            </TouchableOpacity>
          )}
          {attendanceStatus?.currentEntry?.id && (
            <TouchableOpacity
              style={cStyles.translucentBtn}
              onPress={() => setReportIssueOpen(true)}
            >
              <Ionicons name="warning-outline" size={16} color={COLORS.white} />
              <Text style={cStyles.clockBtnText}>{t('issues.report', 'Report an issue')}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={cStyles.translucentBtn}
            onPress={() => setIssueListOpen(true)}
          >
            <Ionicons name="chatbubbles-outline" size={16} color={COLORS.white} />
            <Text style={cStyles.clockBtnText}>{t('issues.myIssues', 'My issues')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={[homeStyles.actionCard, { backgroundColor: colors.card }, style]}
          onPress={clockIn.openClockInModal}
          disabled={isClockLoading || clockIn.isBusy}
          activeOpacity={0.8}
        >
          <View style={[homeStyles.actionCardIcon, cStyles.clockInIconTint]}>
            {isClockLoading || clockIn.isBusy ? (
              <ActivityIndicator size="small" color={COLORS.primary} />
            ) : (
              <Ionicons name="finger-print" size={28} color={COLORS.primary} />
            )}
          </View>
          <View style={homeStyles.actionCardText}>
            <Text style={[homeStyles.actionCardTitle, { color: colors.textPrimary }]}>
              {t('home.fullTime.clockIn')}
            </Text>
            <Text style={[homeStyles.actionCardSubtitle, { color: colors.textMuted }]}>
              {t('home.hybrid.tapToStartShift')}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </TouchableOpacity>
      )}

      <LocationPickerSheet
        {...clockIn.pickerProps}
        confirmDisabled={clockIn.isClockingIn}
      />

      <ClockOutSheet
        visible={showClockOutConfirm}
        onClose={() => setShowClockOutConfirm(false)}
        onConfirm={confirmClockOut}
        title={t('home.fullTime.clockOutConfirmTitle')}
        message={t('home.fullTime.clockOutConfirmMessage')}
        confirmLabel={t('home.fullTime.clockOut')}
        cancelLabel={t('common.cancel')}
        notesLabel={t('home.fullTime.shiftNotesLabel')}
        notesPlaceholder={t('home.fullTime.shiftNotesPlaceholder')}
        isLoading={isClockLoading}
      />

      {attendanceStatus?.currentEntry?.id && (
        <WorkLogSheet
          visible={worklogOpen}
          onClose={() => setWorklogOpen(false)}
          timeEntryId={attendanceStatus.currentEntry.id}
          title={t('worklog.title', 'What I did today')}
          hint={t('worklog.hint', 'Note what you finish through the shift — it becomes your clock-out summary.')}
        />
      )}

      <ReportIssueSheet
        visible={reportIssueOpen}
        onClose={() => setReportIssueOpen(false)}
        timeEntryId={attendanceStatus?.currentEntry?.id}
        spaceId={attendanceStatus?.currentEntry?.location?.id}
        onCreated={(id) => { setReportIssueOpen(false); setIssueThreadId(id); }}
      />
      <ShiftIssueThreadSheet
        visible={!!issueThreadId}
        onClose={() => setIssueThreadId(null)}
        issueId={issueThreadId}
        canManage={!!((user as any)?.canManageUsers || (user as any)?.canViewAllTasks)}
        currentUserId={(user as any)?.id}
      />
      <ShiftIssueListSheet
        visible={issueListOpen}
        onClose={() => setIssueListOpen(false)}
        onOpen={(id) => { setIssueListOpen(false); setIssueThreadId(id); }}
        onReport={attendanceStatus?.currentEntry?.id ? () => { setIssueListOpen(false); setReportIssueOpen(true); } : undefined}
      />
    </>
  );
}

const cStyles = StyleSheet.create({
  // Compact Attendance Card
  attendanceCard: {
    marginHorizontal: SPACING.lg,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    ...SHADOWS.md,
  },
  attendanceCardActive: {
    backgroundColor: COLORS.primary,
  },
  attendanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  attendanceLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: SPACING.sm,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dotActive: {
    backgroundColor: COLORS.success,
  },
  attendanceStatus: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.slate800,
  },
  attendanceDetail: {
    fontSize: FONT_SIZE.sm,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  clockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    gap: SPACING.xs,
  },
  clockOutBtn: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  clockBtnText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.white,
  },
  // Full-width translucent action buttons (Activity / Report / My issues)
  translucentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: SPACING.sm,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },

  // Clock In Card (when clocked out)
  clockInIconTint: { backgroundColor: 'rgba(37, 99, 235, 0.1)' },
});
