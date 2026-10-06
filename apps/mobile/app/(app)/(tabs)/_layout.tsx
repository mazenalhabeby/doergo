import { View, Text, StyleSheet, Pressable, Animated, Image } from 'react-native';
import { Tabs, type Href } from 'expo-router';
import { useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { splitTabs, tabAccessFor, tabVisible } from '../../../src/lib/tab-layout';
import { manageRowsFor } from '../../../src/lib/manage-rows';
import { AnimatedLogo } from '../../../src/components';
import { TabPill } from '../../../src/components/amazen';
import { useAuth } from '../../../src/contexts/auth-context';
import { useTheme } from '../../../src/contexts/theme-context';
import { COLORS, SPACING } from '../../../src/lib/constants';
import { TourTarget } from '../../../src/components/tour';
import { hasManageSurface } from '../../../src/lib/manage-rows';
import { useProfileAvatar } from '../../../src/lib/use-profile-avatar';

/*
  Which tabs the tours spotlight.

  ⚠️ `time-off` was here and is GONE — not because the step was wrong, but
  because Time off left the bar for the overflow in v2, so the target would
  never have mounted. The step is `optional`, so it would have failed
  silently: a tour that quietly skips a third of itself on every run is worse
  than one that is honestly shorter. The step is removed from the registry too.
*/
const TAB_TOUR_KEY: Record<string, string> = {
  index: 'tab-home',
  tasks: 'tab-tasks',
  attendance: 'tab-attendance',
  team: 'tab-team',
  chat: 'tab-chat',
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
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const initial = user?.firstName?.[0]?.toUpperCase() || '?';
  // The same picture and the same destination as every amazen header's avatar.
  const { avatarUrl, openProfile } = useProfileAvatar();

  const handlePressIn = () => {
    Animated.spring(scaleAnim, { toValue: 0.88, friction: 5, useNativeDriver: true }).start();
  };
  const handlePressOut = () => {
    Animated.spring(scaleAnim, { toValue: 1, friction: 4, useNativeDriver: true }).start();
  };

  return (
    <Pressable
      onPress={openProfile}
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
  const { t } = useTranslation();
  const { user } = useAuth();
  /*
    ⚠️ WHO GETS WHICH TAB IS ONE FUNCTION — `tabVisible` in tab-layout.ts —
    read here, by the navigator's `href`s below and by the More page. Three
    inline copies is how the bar hides a tab More still offers.
  */
  const access = useMemo(() => tabAccessFor(user as never), [user]);
  const visibleRoutes = state.routes.filter((route: any) => tabVisible(route.name, access));

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

  const currentRoute = state.routes[state.index];
  // Being on More — or INSIDE the overflow — has to look different from being
  // anywhere else, or the bar shows nothing selected and the person cannot tell where they are.
  const inOverflow = currentRoute?.name === 'more' || overflowRoutes.some((r: any) => r.key === currentRoute?.key);

  const getAdjustedIndex = () => barRoutes.findIndex((r: any) => r.key === currentRoute.key);

  /*
    ⚠️ NO BAR ON THE PROFILE PAGE. It is a page you go INTO — from the avatar —
    with Back in its header, not a place among the tabs. Returned after every
    hook above, so the hook order never changes with the route.
  */
  if (currentRoute?.name === 'profile') return null;
  // A screen can ask for the room — a conversation, with its keyboard.
  if (descriptors[currentRoute?.key]?.options?.tabBarHidden) return null;

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
                /*
                  ⚠️ A PAGE, NOT A SHEET. More was a popup list; it is a tab
                  page now (`more.tsx`), so it has room to group what it holds,
                  show what waits, and keep the bar — with ••• lit — under it.
                */
                onPress: () => navigation.navigate('more'),
              }
            : undefined
        }
      />


    </>
  );
}

export default function TabsLayout() {
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  // ⚠️ The same answer the bar reads — `tabAccessFor` in tab-layout.ts.
  const access = useMemo(() => tabAccessFor(user as never), [user]);
  const { isAdmin } = access;
  const showTechTasks = access.tasks;
  const showAttendance = access.attendance;
  const showTimeOff = access.timeOff;
  const showCreate = access.create;
  const showTeam = access.team;
  const showChat = access.chat;

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
            // The screen draws its own "Jobs" header with the New job disc — job-flow.html.
            headerShown: false,
          }}
        />
        {/* Create Task tab - ADMIN or technicians with canCreateTasks */}
        <Tabs.Screen
          name="create-task"
          options={{
            title: t('tabs.createTask'),
            href: (isAdmin || showCreate) ? '/create-task' : null,
            // The screen draws its own back button and "New job" — job-flow.html.
            headerShown: false,
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
            // ⚠️ The page draws the shared ScreenHeader itself — no navigator band.
            headerShown: false,
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
            // The page draws the shared ScreenHeader — no navigator band.
            headerShown: false,
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
        {/* Calendar — the organization's own (shared calendar/*); in the overflow behind the fixed four. */}
        <Tabs.Screen
          name="calendar"
          options={{
            title: t('tabs.calendar', 'Calendar'),
            href: access.calendar ? ('/calendar' as Href) : null,
            headerShown: false,
          }}
        />
        {/* More — a page now, not a popup. Reached from the bar's •••, never a slot of its own. */}
        <Tabs.Screen
          name="more"
          options={{
            title: t('tabs.more', 'More'),
            href: null,
            headerShown: false,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: t('tabs.profile'),
            // The page draws the shared ScreenHeader with Back — no navigator band.
            headerShown: false,
          }}
        />
      </Tabs>

    </View>
  );
}

const styles = StyleSheet.create({
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
