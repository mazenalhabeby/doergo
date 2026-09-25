import { View, Text, StyleSheet, Platform, Pressable, Animated, TouchableOpacity, Image, ScrollView } from 'react-native';
import { Tabs, useRouter, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRef, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BlurSheet } from '../../../src/components/blur-sheet';
import { SheetPanel } from '../../../src/components/sheet-panel';
import { splitTabs, tabIconName } from '../../../src/lib/tab-layout';
import { manageRowsFor } from '../../../src/lib/manage-rows';
import { holds } from '../../../src/lib/permissions';
import { ShiftIssueListSheet, ShiftIssueThreadSheet } from '../../../src/components/shift-issue-sheet';
import { AnimatedLogo } from '../../../src/components';
import { TabPill } from '../../../src/components/amazen';
import { TAB_GLYPHS } from '../../../src/components/glyphs/tab-glyphs';
import { useAuth } from '../../../src/contexts/auth-context';
import { useTheme } from '../../../src/contexts/theme-context';
import { COLORS, SPACING, FONT_SIZE, FONT_WEIGHT } from '../../../src/lib/constants';
import { TourTarget, useTourTarget } from '../../../src/components/tour';
import { Role, hasAccessModule, normalizeRole, canContactColleagues, orgHasAddOn } from '@hbcfield/shared/client';
import { hasManageSurface } from '../../../src/lib/manage-rows';
import { resolveMediaUrl } from '../../../src/lib/api';

/*
  Which tabs the tours spotlight.

  ⚠️ `time-off` was here and is GONE — not because the step was wrong, but
  because Time off left the bar for the overflow in v2, so the target would
  never have mounted. The step is `optional`, so it would have failed
  silently: a tour that quietly skips a third of itself on every run is worse
  than one that is honestly shorter. The step is removed from the registry too.
*/
const TAB_TOUR_KEY: Record<string, string> = {
  tasks: 'tab-tasks',
  attendance: 'tab-attendance',
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

/*
  ⚠️ `TabItem` WAS HERE AND IS GONE.

  It drew one slot of the old edge-to-edge bar: an Ionicon, a label under it,
  a spring on press and a Material-style pill behind the active one. All of
  that now lives in `TabPill`, measured off the design reference — including
  the press feedback, which is opacity rather than a spring because the active
  slot changes WIDTH and a scale transform on a flexing box judders.
*/

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
  /*
    Messages is one of the five now.

    Two gates, because they answer different questions: the organization has to
    have BOUGHT chat, and this member has to be allowed to talk to colleagues —
    an admin can switch the second off per person in the Access Builder. Either
    one missing and the slot is not drawn at all, rather than drawn and refused.
  */
  const showChat = orgHasAddOn(user?.orgAddOns ?? null, 'live_chat') && canContactColleagues(user || {});

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
    if (route.name === 'chat') return showChat;
    if (route.name === 'team') return showTeam;
    if (isAdmin) {
      // Clock is module-driven, not role-locked: an admin/owner who also works
      // on site (has the `clock` module) sees the Clock tab too — optional, never
      // required. Matches the web navbar clock. The route href already gates on
      // showAttendance; this lets the tab button through.
      if (route.name === 'attendance') return showAttendance;
      if (route.name === 'time-off') return false;
      /*
        ⚠️ Chat is checked ABOVE this branch and not here, because this branch
        ends in `return true` — anything an admin is not explicitly asked about
        is allowed through. A Messages tab for an organization that never
        bought chat opens onto a 402.
      */
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

  return (
    <>
      {/*
        ⚠️ THE BAR IS A FLOATING PILL NOW, not a band at the bottom.

        `TOKENS.md` gives the tab bar `radius-full` and every screen reserves
        `space-tabsafe: 110` below its content — two facts that only fit one
        shape. The gradient runs underneath it, which is why it is absolutely
        positioned and the screen behind it keeps its full height.

        Everything it draws is measured, not chosen: see `TabPill`.
      */}
      <TabPill
        items={barRoutes.map((route: any, index: number) => ({
          key: route.key,
          name: route.name,
          label: descriptors[route.key].options.title || route.name,
          focused: getAdjustedIndex() === index,
          tourKey: TAB_TOUR_KEY[route.name],
          onPress: () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (getAdjustedIndex() !== index && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          },
        }))}
        more={
          showMore
            ? {
                label: t('tabs.more', 'More'),
                /*
                  ⚠️ Being INSIDE the overflow has to look different from being
                  anywhere else, or the bar shows nothing selected and the
                  person cannot tell where they are.
                */
                focused: inOverflow,
                onPress: () => setMoreOpen(true),
              }
            : undefined
        }
      />

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
                  {/*
                    The SAME mark the pill draws.

                    ⚠️ The overflow is part of the footer, and it was still on
                    Ionicons while the pill had moved to the house set — so
                    Time off was a calendar in two different drawings depending
                    on which door you came through. `TAB_GLYPHS` is the one map
                    and both surfaces read it.
                  */}
                  <View style={[styles.moreIcon, { backgroundColor: COLORS.primary + '15' }]}>
                    {(() => {
                      const G = TAB_GLYPHS[route.name];
                      return G ? (
                        <G size={19} color={active ? COLORS.primary : themeColors.textMuted} />
                      ) : (
                        <Ionicons
                          name={tabIconName(route.name, active) as any}
                          size={19}
                          color={active ? COLORS.primary : themeColors.textMuted}
                        />
                      );
                    })()}
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
        onOpen={(id) => setIssueId(id)}
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
    </>
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
  /*
    Messages is one of the five now.

    Two gates, because they answer different questions: the organization has to
    have BOUGHT chat, and this member has to be allowed to talk to colleagues —
    an admin can switch the second off per person in the Access Builder. Either
    one missing and the slot is not drawn at all, rather than drawn and refused.
  */
  const showChat = orgHasAddOn(user?.orgAddOns ?? null, 'live_chat') && canContactColleagues(user || {});

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      {/*
        ⚠️ NO `<StatusBar>` HERE. The root layout owns it, driven by the app's
        theme, and a second one mounted at the same time simply fights it —
        both write the same global on every render and the winner is commit
        order. See the note in `app/_layout.tsx`.

        `backgroundColor` is gone for a separate reason worth keeping: expo
        forwards it to React Native, which calls the deprecated
        `Window.setStatusBarColor` — one of the APIs Play names in "Deine App
        verwendet nicht mehr unterstützte APIs oder Parameter für die randlose
        Anzeige". It has been a no-op on the device since Android 15 enforced
        edge-to-edge; it was only ever reaching the bundle scanner. Nothing
        replaces it: the navigator's header already carries `colors.header` and
        is padded by the top safe-area inset, so it is the header that paints
        behind the status bar.
      */}

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
          /*
            THE PAGE MOVES WITH THE CAPSULE.

            `shift` slides the outgoing screen out and the incoming one in, in
            the direction of travel — so tapping a tab to the RIGHT pushes the
            content left, and the capsule underneath is moving right into the
            gap. The two read as one gesture.

            ⚠️ NOT `fade`. A crossfade says "something replaced this"; a shift
            says "you moved", which is the true thing and the one that makes a
            bar of five destinations feel like a row rather than a menu.

            ⚠️ AND NOT A LONGER ONE. This runs on every single tab press, all
            day, on a phone in somebody's hand between two jobs. React
            Navigation's own duration is deliberately short; the pill's own
            180ms slide is the thing with the character, and the page just has
            to not be jarring underneath it.

            Reduced motion is handled by the navigator: it drops to no
            animation when the system asks.
          */
          animation: 'shift',
          /*
            ⚠️ THE PAGE RUNS ON THE SAME SPRING AS THE CAPSULE.

            The default is a timing curve, and the pill's own motion is a
            spring — so the content arrived on one schedule and the tint on
            another, and the eye reads two things happening rather than one.
            Matching them is what makes a tab press feel like a single
            gesture instead of two animations that happen to start together.

            `useNativeDriver` is forced on by the navigator, so this runs off
            the JS thread — it stays smooth while the incoming screen mounts
            and fetches, which is exactly when it used to stutter.
          */
          transitionSpec: {
            animation: 'spring',
            config: {
              stiffness: 180,
              damping: 22,
              mass: 0.9,
              overshootClamping: true,
              restDisplacementThreshold: 0.2,
              restSpeedThreshold: 0.2,
            },
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            /*
              ⚠️ NO NAVIGATION BAR ON HOME.

              The screen draws its own — the date, the organization, and the
              avatar — and the stock band on top of it would be two headers,
              the upper one spending 56pt to say "Home" to somebody who just
              pressed Home.
            */
            headerShown: false,
            /*
              ⚠️ ALWAYS "Home", never "Dashboard" — and this is a v2 reversal.

              It used to ask `oversees(user)` and label a supervisor's tab
              "Dashboard", on the reasoning that the label should say what the
              screen IS. Two things undid that:

              1. The design reference labels this tab **Home** on a screen that
                 is plainly an oversight view — an organization header and a
                 day's jobs across the site.
              2. The screen behind it stopped forking. `(tabs)/index.tsx` is
                 one composed column of widgets now; entitlement filters the
                 list rather than choosing between four different screens. So
                 there is no longer a "dashboard" for the label to name.

              `tabs.dashboard` stays in the locale files. Nothing reads it
              today, and it is the right word if an oversight surface ever
              becomes a place of its own again.
            */
            title: t('tabs.home'),
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
        {/*
          Messages — one of the five since v2.

          It lived at `app/(app)/chat.tsx` and moved in here, because a tab has
          to be inside the group to carry the pill. The old path is a redirect
          and must stay: every chat push already delivered to a phone names it.

          Its own header, because the screen draws a conversation title and a
          back affordance of its own and the group header would sit above both.
        */}
        <Tabs.Screen
          name="chat"
          options={{
            title: t('tabs.messages', 'Chat'),
            href: showChat ? '/chat' : null,
            headerShown: false,
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
