import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Icon } from '@/components/amazen/ink-icon';
import { useTranslation } from 'react-i18next';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/contexts/theme-context';
import { useScreenWidth } from '@/components/screen-container';
import { manageRowsFor } from '@/lib/manage-rows';
import { holds } from '@/lib/permissions';
import { ShiftIssueListSheet, ShiftIssueThreadSheet } from '@/features/time/shift-issue-sheet';
import { SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT, SHADOWS } from '@/lib/constants';
import { Ground, ScreenHeader, useTabSafe } from '@/components/amazen';

export default function ManageScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const tabSafe = useTabSafe();
  const wide = useScreenWidth();
  const { t } = useTranslation();
  const rows = useMemo(() => manageRowsFor(user), [user]);
  /*
    Shift issues open here rather than on a route of their own: the list and the
    thread are sheets, built for the clock screens that a supervisor does not
    have. Hosting them from Manage gives the permission a door without a second
    copy of either component.
  */
  const [issuesOpen, setIssuesOpen] = useState(false);
  const [issueId, setIssueId] = useState<string | null>(null);
  // A tapped shift-issue notification names the thread to open.
  const { issueId: issueFromNotification } = useLocalSearchParams<{ issueId?: string }>();
  useEffect(() => {
    if (issueFromNotification) setIssueId(issueFromNotification);
  }, [issueFromNotification]);

  return (
    <Ground style={s.container}>
      {/* The page draws its own header, as every tab root does — no navigator band. */}
      <ScreenHeader title={t('tabs.manage')} style={wide} />
      <ScrollView
        style={s.container}
        contentContainerStyle={[s.content, { paddingBottom: tabSafe }, wide]}
        showsVerticalScrollIndicator={false}
      >
        {rows.map((item) => (
          <TouchableOpacity
            key={item.route}
            style={[s.row, { backgroundColor: colors.card }]}
            onPress={() => (item.route === 'sheet:issues' ? setIssuesOpen(true) : router.push(item.route as Href))}
            activeOpacity={0.6}
          >
            <View style={[s.iconBox, { backgroundColor: item.color + '15' }]}>
              <Icon name={item.icon} size={22} color={item.color} />
            </View>
            <View style={s.textCol}>
              <Text style={[s.label, { color: colors.textPrimary }]}>{t(item.labelKey)}</Text>
              <Text style={[s.desc, { color: colors.textMuted }]}>{t(item.descKey)}</Text>
            </View>
            <Icon name="chevronRight" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ShiftIssueListSheet
        visible={issuesOpen}
        onClose={() => setIssuesOpen(false)}
        onOpen={(id) => {
          setIssuesOpen(false);
          setIssueId(id);
        }}
      />
      <ShiftIssueThreadSheet
        visible={!!issueId}
        issueId={issueId}
        onClose={() => setIssueId(null)}
        /* Whether the actions render is the server's call in the end; this only
         decides what to draw, and it asks the same question the API does. */
        canManage={holds(user, 'canViewAllTasks')}
        currentUserId={user?.id}
      />
    </Ground>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  /*
    ⚠️ The bottom padding is composed at the call site from `useTabSafe()`, not
    set here — it depends on the device's safe-area inset, and a stylesheet is
    built once at module load when no inset is known.

    It is reserved even though Manage is not a tab any more: its rows moved
    into the More sheet and the tab button is gone, but the ROUTE is still
    registered, deliberately, so a push notification or a deep link into it
    resolves. Arriving that way, the floating pill is still drawn over this
    screen and still reserves no layout of its own.
  */
  content: { padding: SPACING.lg, gap: SPACING.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.lg,
    borderRadius: RADIUS.lg,
    ...SHADOWS.sm,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.lg,
  },
  textCol: { flex: 1 },
  label: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.semibold },
  desc: { fontSize: FONT_SIZE.sm, marginTop: 2 },
});
