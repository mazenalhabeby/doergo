import { View, Text, StyleSheet, Platform, Pressable, Animated, TouchableOpacity, Image, ScrollView } from 'react-native';
import { Tabs, useRouter, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRef, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BlurSheet } from '../../../src/components/blur-sheet';
import { SheetPanel } from '../../../src/components/sheet-panel';
import { splitTabs, tabIconName } from '../../../src/lib/tab-layout';
import { manageRowsFor } from '../../../src/lib/manage-rows';
import { holds } from '../../../src/lib/permissions';
import { ShiftIssueListSheet, ShiftIssueThreadSheet } from '../../../src/components/shift-issue-sheet';
import { AnimatedLogo } from '../../../src/components';
import { useAuth } from '../../../src/contexts/auth-context';
import { useTheme } from '../../../src/contexts/theme-context';
import { COLORS, SPACING, FONT_SIZE, FONT_WEIGHT } from '../../../src/lib/constants';
import { TourTarget, useTourTarget } from '../../../src/components/tour';
import { Role, hasAccessModule, normalizeRole, canContactColleagues } from '@hbcfield/shared/client';
import { oversees } from '../../../src/lib/permissions';
import { hasManageSurface } from '../../../src/lib/manage-rows';
import { resolveMediaUrl } from '../../../src/lib/api';

// Maps a tab route name → guided-tour target key (only the tabs the tours spotlight).
const TAB_TOUR_KEY: Record<string, string> = {
  tasks: 'tab-tasks',
  attendance: 'tab-attendance',
  'time-off': 'tab-time-off',
};

// Logo icon for header left
function HeaderLogo() {
  return (
    <View style={styles.headerLeft}>
      <AnimatedLogo size="small" iconOnly />
    </View>
  );
}

// Profile avatar button for header right — modern floating style
// Availability → dot color (matches profile.tsx status colors).
function presenceColor(presence?: string | null): string {
  if (presence === 'BUSY') return '#ef4444';
  if (presence === 'AWAY') return '#f59e0b';
  return '#22c55e'; // AVAILABLE / default
}

// Profile avatar button for header right — shows the user's photo (or initials)
// with an availability status dot.
function ProfileButton() {
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const initial = user?.firstName?.[0]?.toUpperCase() || '?';
  // Uploaded avatars are stored as a relative path (/uploads/avatars/…).
  // React Native's <Image> can't load a relative URI, so resolve it to the
  // absolute host URL — otherwise the header avatar renders blank.
  const avatarUrl = resolveMediaUrl(user?.avatarUrl);

  const handlePressIn = () => {
    Animated.spring(scaleAnim, { toValue: 0.88, friction: 5, useNativeDriver: true }).start();
  };
  const handlePressOut = () => {
    Animated.spring(scaleAnim, { toValue: 1, friction: 4, useNativeDriver: true }).start();
  };

  return (
    <Pressable
      onPress={() => router.push('/(app)/(tabs)/profile')}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={styles.profileBtn}
    >
      <TourTarget name="tab-profile">
      <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
        <View style={[
          styles.profileAvatar,
          { backgroundColor: avatarUrl ? colors.surface : (isDark ? COLORS.primary + '25' : COLORS.primary) },
        ]}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.profileImage} />
          ) : (
            <Text style={[styles.profileInitials, { color: isDark ? COLORS.primary : '#fff' }]}>{initial}</Text>
          )}
        </View>
        {/* Availability status dot */}
        <View style={[
          styles.statusDot,
          { backgroundColor: presenceColor(user?.presence), borderColor: colors.background },
        ]} />
      </Animated.View>
      </TourTarget>
    </Pressable>
  );
}

// Animated Tab Item
function TabItem({
  route,
  label,
  isFocused,
  onPress,
  themeColors,
}: {
  route: any;
  label: string;
  isFocused: boolean;
  onPress: () => void;
  themeColors: import('../../../src/lib/constants').ThemeColors;
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const indicatorAnim = useRef(new Animated.Value(isFocused ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(indicatorAnim, {
      toValue: isFocused ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [isFocused]);

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.9,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 4,
      useNativeDriver: true,
    }).start();
  };

  const iconName = tabIconName(route.name, isFocused);

  const tourKey = TAB_TOUR_KEY[route.name];

  // Soft capsule that fades/scales in behind the active icon — replaces the old
  // underline bar (which overlapped the label). Modern Material-3-style pill.
  const pillScale = indicatorAnim.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] });
  const inner = (
    <>
      <Animated.View style={[styles.iconRow, { transform: [{ scale: scaleAnim }] }]}>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.activePill,
            { backgroundColor: themeColors.primaryLight, opacity: indicatorAnim, transform: [{ scale: pillScale }] },
          ]}
        />
        <Ionicons
          name={iconName as any}
          size={23}
          color={isFocused ? COLORS.primary : themeColors.textMuted}
        />
      </Animated.View>
      <Text
        style={[styles.tabLabel, { color: isFocused ? COLORS.primary : themeColors.textMuted }, isFocused && styles.tabLabelActive]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
      >
        {label}
      </Text>
    </>
  );

  return (
    <Pressable
      style={styles.tabItem}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      {tourKey ? (
        <TourTarget name={tourKey} style={styles.tabItemInner}>
          {inner}
        </TourTarget>
      ) : (
        inner
      )}
    </Pressable>
  );
}

// Custom Tab Bar - Full width premium design
function CustomTabBar({ state, descriptors, navigation }: any) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { colors: themeColors } = useTheme();
  const { user } = useAuth();
  const isAdmin = normalizeRole(user?.role || '') === Role.ADMIN;
  // Tab visibility is driven by the per-user Access Profile. hasAccessModule
  // defaults to ON for users without a profile (admins/managers), so the admin
  // branch below still governs their tabs.
  const showTasks = hasAccessModule(user || {}, 'tasks');
  const showAttendance = hasAccessModule(user || {}, 'clock');
  const showTimeOff = hasAccessModule(user || {}, 'time_off');
  /*
    One question, asked once.

    `hasAccessModule('create_task')` already IS the create permission — it
    derives from `canCreateTasks`, org-wide or held in a space. The second half
    of this was the same decision asked a narrower way, and it cancelled the
    first: a member granted "create tasks" by a space role passed the module
    check and was then refused by the org column.
  */
  const showCreate = hasAccessModule(user || {}, 'create_task');
  const showTeam = canContactColleagues(user || {});

  // Filter routes based on role and modules (profile is in header, not tab bar)
  const visibleRoutes = state.routes.filter((route: any) => {
    if (route.name === 'profile') return false;
    /*
      Manage is not a tab any more, in any role.

      It was a tab whose entire content was a list of links, sitting beside
      More, which is also a list of links. Its rows are in More now — see
      manageRows below. The ROUTE stays registered so a push notification or a
      deep link into it still resolves.
    */
    if (route.name === 'manage') return false;
    if (route.name === 'team') return showTeam;
    if (isAdmin) {
      // Clock is module-driven, not role-locked: an admin/owner who also works
      // on site (has the `clock` module) sees the Clock tab too — optional, never
      // required. Matches the web navbar clock. The route href already gates on
      // showAttendance; this lets the tab button through.
      if (route.name === 'attendance') return showAttendance;
      if (route.name === 'time-off') return false;
      return true;
    }
    /*
      Manage is a PERMISSION, not a rank.

      It was `isAdmin`, so the management surface was invisible to everyone
      whose authority comes from a space — the shift leader who approves the
      hours, the supervisor who signs them off. The tab now appears when at
      least one row inside it would open (see manage-rows.ts), so it is never
      an empty tab and never a wall of refusals.
    */
    if (route.name === 'create-task') return showCreate;
    if (route.name === 'tasks') return showTasks;
    if (route.name === 'attendance') return showAttendance;
    if (route.name === 'time-off') return showTimeOff;
    return true;
  });

  /*
    Split into what fits and what does not.

    Cheap by construction — at most seven items, sorted and sliced — but it runs
    on every navigation, so it is memoised on the route names rather than the
    route objects, which React Navigation recreates each time.
  */
  const routeNames = visibleRoutes.map((r: any) => r.name).join(',');
  /*
    What Manage used to hold. Same array the old screen read, so a member never
    sees a row that would refuse them.
  */
  const manageRows = useMemo(() => manageRowsFor(user || {}), [user]);
  const { barRoutes, overflowRoutes, showMore } = useMemo(
    () => splitTabs(visibleRoutes, manageRows.length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [routeNames, manageRows.length],
  );

  const [moreOpen, setMoreOpen] = useState(false);
  const [issuesOpen, setIssuesOpen] = useState(false);
  const [issueId, setIssueId] = useState<string | null>(null);
  const currentRoute = state.routes[state.index];
  // Being INSIDE the overflow has to look different from being anywhere else,
  // or the bar shows nothing selected and the person cannot tell where they are.
  const inOverflow = overflowRoutes.some((r: any) => r.key === currentRoute?.key);

  const getAdjustedIndex = () => barRoutes.findIndex((r: any) => r.key === currentRoute.key);

  const isDark = themeColors.tabBar === '#0a0a10'; // quick dark mode check

  return (
    <View style={[styles.tabBarOuter, {
      paddingBottom: insets.bottom,
      backgroundColor: isDark ? '#0a0a10' : '#ffffff',
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
      // Soft upward lift so the bar reads as a floating surface (premium depth).
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -3 },
      shadowOpacity: isDark ? 0.35 : 0.06,
      shadowRadius: 12,
      elevation: 12,
    }]}>
      <View style={styles.tabBarInner}>
        {barRoutes.map((route: any, index: number) => {
          const { options } = descriptors[route.key];
          const label = options.title || route.name;
          const isFocused = getAdjustedIndex() === index;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          return (
            <TabItem
              key={route.key}
              route={route}
              label={label}
              isFocused={isFocused}
              onPress={onPress}
              themeColors={themeColors}
            />
          );
        })}

        {/* The fifth slot, only when there is something to put in it. */}
        {showMore && (
          <Pressable style={styles.tabItem} onPress={() => setMoreOpen(true)} accessibilityRole="button">
            <View style={styles.tabItemInner}>
              <View style={styles.iconRow}>
                <Ionicons
                  name={inOverflow ? 'ellipsis-horizontal-circle' : 'ellipsis-horizontal-circle-outline'}
                  size={23}
                  color={inOverflow ? COLORS.primary : themeColors.textMuted}
                />
              </View>
              <Text
                style={[styles.tabLabel, { color: inOverflow ? COLORS.primary : themeColors.textMuted }, inOverflow && styles.tabLabelActive]}
                numberOfLines={1}
              >
                {t('tabs.more', 'More')}
              </Text>
            </View>
          </Pressable>
        )}
      </View>

      {/*
        The overflow, as a list rather than a second row of icons.

        A row would recreate the problem it exists to solve; a list has room for
        a full label, which is what these less-frequent destinations need — a
        person opening More is looking for something by name, not by glyph.
      */}
      <BlurSheet visible={moreOpen} onClose={() => setMoreOpen(false)}>
        {/*
          The surface comes from SheetPanel — background, rounded top, handle,
          and the bottom inset. Drawn by hand here it had a flat 28px foot, so
          the last row sat behind the Android navigation keys.

          No title: this is a list of places, and the handle plus a tap outside
          already say everything a title and a cross would.
        */}
        <SheetPanel onClose={() => setMoreOpen(false)} style={styles.moreSheet}>
          <ScrollView showsVerticalScrollIndicator={false} style={styles.moreScroll}>
            {/* The tabs that did not fit. Plain rows — they are places. */}
            {overflowRoutes.map((route: any) => {
              const { options } = descriptors[route.key];
              const active = route.key === currentRoute?.key;
              return (
                <Pressable
                  key={route.key}
                  style={[styles.moreRow, { borderColor: themeColors.border }]}
                  onPress={() => {
                    setMoreOpen(false);
                    navigation.navigate(route.name);
                  }}
                >
                  <View style={[styles.moreIcon, { backgroundColor: COLORS.primary + '15' }]}>
                    <Ionicons
                      name={tabIconName(route.name, active) as any}
                      size={19}
                      color={active ? COLORS.primary : themeColors.textMuted}
                    />
                  </View>
                  <Text style={[styles.moreLabel, { color: active ? COLORS.primary : themeColors.textPrimary }]}>
                    {options.title || route.name}
                  </Text>
                  {active && <Ionicons name="checkmark" size={16} color={COLORS.primary} />}
                </Pressable>
              );
            })}

            {/*
              What Manage used to be.

              Each row keeps its own colour and description: these are nine
              different jobs, not variations of one, and the description is
              often the only thing that tells "Attendance" (approve other
              people's hours) from the Clock tab (your own).
            */}
            {manageRows.length > 0 && (
              <>
                {overflowRoutes.length > 0 && (
                  <Text style={[styles.moreSectionLabel, { color: themeColors.textMuted }]}>
                    {t('tabs.manage', 'Manage')}
                  </Text>
                )}
                {manageRows.map((row) => (
                  <Pressable
                    key={row.route}
                    style={[styles.moreRow, { borderColor: themeColors.border }]}
                    onPress={() => {
                      setMoreOpen(false);
                      // Shift issues are sheets, not a route — see below.
                      if (row.route === 'sheet:issues') setIssuesOpen(true);
                      else router.push(row.route as any);
                    }}
                  >
                    <View style={[styles.moreIcon, { backgroundColor: row.color + '15' }]}>
                      <Ionicons name={row.icon as any} size={19} color={row.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.moreLabel, { color: themeColors.textPrimary }]}>{t(row.labelKey)}</Text>
                      <Text style={[styles.moreDesc, { color: themeColors.textMuted }]} numberOfLines={1}>
                        {t(row.descKey)}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={themeColors.textMuted} />
                  </Pressable>
                ))}
              </>
            )}
          </ScrollView>
        </SheetPanel>
      </BlurSheet>

      {/*
        Shift issues are a list sheet and a thread sheet, not a route. The
        Manage screen used to host them; with Manage gone from the bar, More is
        their door — the alternative was a route that exists only to open a
        sheet.
      */}
      <ShiftIssueListSheet
        visible={issuesOpen}
        onClose={() => setIssuesOpen(false)}
        onOpen={(id) => { setIssuesOpen(false); setIssueId(id); }}
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
    </View>
  );
}

export default function TabsLayout() {
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const isAdmin = normalizeRole(user?.role || '') === Role.ADMIN;
  const showTechTasks = hasAccessModule(user || {}, 'tasks');
  const showAttendance = hasAccessModule(user || {}, 'clock');
  const showTimeOff = hasAccessModule(user || {}, 'time_off');
  /*
    One question, asked once.

    `hasAccessModule('create_task')` already IS the create permission — it
    derives from `canCreateTasks`, org-wide or held in a space. The second half
    of this was the same decision asked a narrower way, and it cancelled the
    first: a member granted "create tasks" by a space role passed the module
    check and was then refused by the org column.
  */
  const showCreate = hasAccessModule(user || {}, 'create_task');
  const showTeam = canContactColleagues(user || {});

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      {/*
        ⚠️ `backgroundColor` was removed, not moved. expo-status-bar warns that
        it is unsupported under edge-to-edge and then forwards the prop to React
        Native anyway, which calls the deprecated `Window.setStatusBarColor` —
        one of the APIs Play names in "Deine App verwendet nicht mehr
        unterstützte APIs oder Parameter für die randlose Anzeige". It has been
        a no-op on the device since Android 15 enforced edge-to-edge; it was
        only ever reaching the bundle scanner.

        Nothing replaces it: the navigator's header already carries
        `colors.header` and is padded by the top safe-area inset, so it is the
        header that paints behind the status bar. `style` stays — icon
        contrast is the supported half of this API.
      */}
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <Tabs
        tabBar={(props) => <CustomTabBar {...props} />}
        screenOptions={{
          headerStyle: {
            backgroundColor: colors.header,
            elevation: 0,
            shadowOpacity: 0,
            borderBottomWidth: 0,
          },
          headerShadowVisible: false,
          headerTitleAlign: 'center' as const,
          headerTitleStyle: {
            fontSize: 14,
            fontWeight: '500' as const,
            color: colors.textMuted,
            letterSpacing: 0.3,
          },
          headerLeft: () => <HeaderLogo />,
          headerRight: () => <ProfileButton />,
          tabBarHideOnKeyboard: true,
          sceneStyle: { backgroundColor: colors.surface },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            /* Says what the screen IS: `oversees` decides which home renders
               (see (tabs)/index.tsx), so the label has to ask the same question
               or a supervisor gets the dashboard under a tab marked "Home". */
            title: oversees(user) ? t('tabs.dashboard') : t('tabs.home'),
          }}
        />
        {/* Tasks tab - ADMIN always sees, TECHNICIAN based on enabledModules */}
        <Tabs.Screen
          name="tasks"
          options={{
            title: t('tabs.tasks'),
            href: isAdmin || showTechTasks ? '/tasks' : null,
          }}
        />
        {/* Create Task tab - ADMIN or technicians with canCreateTasks */}
        <Tabs.Screen
          name="create-task"
          options={{
            title: t('tabs.createTask'),
            href: (isAdmin || showCreate) ? '/create-task' : null,
          }}
        />
        {/* Manage tab — offered to whoever holds something inside it. */}
        <Tabs.Screen
          name="manage"
          options={{
            title: t('tabs.manage'),
            href: hasManageSurface(user) ? '/manage' : null,
          }}
        />
        {/* Clock tab - TECHNICIAN only, based on enabledModules */}
        <Tabs.Screen
          name="attendance"
          options={{
            title: t('tabs.attendance'),
            href: showAttendance ? '/attendance' : null,
          }}
        />
        {/* Time Off tab - module-driven */}
        <Tabs.Screen
          name="time-off"
          options={{
            title: t('tabs.timeOff'),
            href: showTimeOff ? '/time-off' : null,
          }}
        />
        {/* Team tab - when the user can contact colleagues */}
        <Tabs.Screen
          name="team"
          options={{
            title: t('tabs.team'),
            href: showTeam ? '/team' : null,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: t('tabs.profile'),
            headerRight: () => null,
          }}
        />
      </Tabs>

    </View>
  );
}

const styles = StyleSheet.create({
  // Tighter than SheetPanel's default: these rows carry their own padding.
  moreSheet: { paddingHorizontal: 16, paddingTop: 12, gap: 8 },
  moreRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 14, paddingHorizontal: 14,
    borderRadius: 12, borderWidth: 1,
  },
  moreLabel: { flex: 1, fontSize: 15, fontWeight: '600' },
  moreDesc: { fontSize: 12, marginTop: 1 },
  moreIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  moreScroll: { maxHeight: 420 },
  moreSectionLabel: {
    fontSize: 11, fontWeight: '700', letterSpacing: 0.6,
    textTransform: 'uppercase', marginTop: 14, marginBottom: 6, paddingHorizontal: 4,
  },
  container: {
    flex: 1,
  },
  headerLeft: {
    marginLeft: SPACING.md,
  },
  profileBtn: {
    marginRight: SPACING.md,
    paddingLeft: SPACING.sm,
  },
  profileAvatar: {
    width: 34,
    height: 34,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  profileImage: {
    width: '100%',
    height: '100%',
  },
  profileInitials: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  statusDot: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
  // Premium tab bar — clean pill indicator, no overlapping underline.
  tabBarOuter: {
  },
  tabBarInner: {
    flexDirection: 'row',
    paddingTop: 8,
    paddingBottom: 2,
    paddingHorizontal: 4,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
    minWidth: 0,
  },
  tabItemInner: {
    alignItems: 'center',
    width: '100%',
  },
  // Capsule that hosts the icon; the active pill fills it behind the glyph.
  iconRow: {
    width: 52,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activePill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 16,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 5,
    width: '100%',
    textAlign: 'center',
    paddingHorizontal: 2,
    letterSpacing: 0.1,
  },
  tabLabelActive: {
    fontWeight: '700',
  },
});
