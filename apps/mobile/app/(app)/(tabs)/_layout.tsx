import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import { CachedImage } from '@/components/cached-image';
import { Tabs, type Href } from 'expo-router';
import { useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { splitTabs, tabAccessFor, tabVisible } from '@/lib/tab-layout';
import { manageRowsFor } from '@/lib/manage-rows';
import { AnimatedLogo } from '@/components/animated-logo';
import { TabPill } from '@/components/amazen';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/contexts/theme-context';
import { COLORS, SPACING } from '@/lib/constants';
import { TourTarget } from '@/features/tour';
import { hasManageSurface } from '@/lib/manage-rows';
import { useProfileAvatar } from '@/lib/use-profile-avatar';
import { initialOf } from '@/lib/people';
import { useChatBadge } from '@/lib/chat-badge';
import { useTabsLayout } from '@/features/app-shell/tabs/use-tabs-layout';
import {
  HeaderLogo,
  ProfileButton,
  CustomTabBar,
  styles,
} from '@/features/app-shell/tabs/tabs-layout-helpers';

export default function TabsLayout() {
  const { user, colors, t, access, isAdmin, showTechTasks, showAttendance, showTimeOff, showCreate, showTeam } =
    useTabsLayout();

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
            href: isAdmin || showCreate ? '/create-task' : null,
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
            // ⚠️ The page draws the shared ScreenHeader itself — no navigator band.
            headerShown: false,
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
        {/* Requests tab (route `time-off`, kept so push taps and links still land) - module-driven */}
        <Tabs.Screen
          name="time-off"
          options={{
            title: t('tabs.timeOff'),
            href: showTimeOff ? '/time-off' : null,
            // The page draws the shared ScreenHeader itself — no navigator band.
            headerShown: false,
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
          One conversation (and "New message"). NOT a tab since 2026-10-15 — the
          list is Team → Messages — but it stays a route in this group: every
          chat push names `/chat`, and `(tabs)` is a group, so a second file at
          `app/(app)/chat.tsx` would claim the same path (a blank screen, once).
        */}
        <Tabs.Screen
          name="chat"
          options={{
            title: t('tabs.messages', 'Chat'),
            href: null,
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
