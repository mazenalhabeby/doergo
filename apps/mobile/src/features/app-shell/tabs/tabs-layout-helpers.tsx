import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import { CachedImage } from '../../../components/cached-image';
import { useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { splitTabs, tabAccessFor, tabVisible } from '../../../lib/tab-layout';
import { manageRowsFor } from '../../../lib/manage-rows';
import { AnimatedLogo } from '../../../components/animated-logo';
import { TabPill } from '../../../components/amazen';
import { useAuth } from '../../../contexts/auth-context';
import { useTheme } from '../../../contexts/theme-context';
import { COLORS, SPACING } from '../../../lib/constants';
import { TourTarget } from '../../tour';
import { useProfileAvatar } from '../../../lib/use-profile-avatar';
import { initialOf } from '../../../lib/people';
import { useChatBadge } from '../../../lib/chat-badge';
import type { TabBarProps } from './tab-bar-props';

/** TabsLayout's module-level helpers, moved here unchanged so its sections can read them too. */
/*
  Which tabs the tours spotlight.

  ⚠️ `time-off` was here and is GONE — not because the step was wrong, but
  because Time off left the bar for the overflow in v2, so the target would
  never have mounted. The step is `optional`, so it would have failed
  silently: a tour that quietly skips a third of itself on every run is worse
  than one that is honestly shorter. The step is removed from the registry too.
*/
export const TAB_TOUR_KEY: Record<string, string> = {
  index: 'tab-home',
  tasks: 'tab-tasks',
  attendance: 'tab-attendance',
  team: 'tab-team',
  chat: 'tab-chat',
};

// Logo icon for header left
export function HeaderLogo() {
  return (
    <View style={styles.headerLeft}>
      <AnimatedLogo size="small" iconOnly />
    </View>
  );
}

// Profile avatar button for header right — modern floating style
// Availability → dot color (matches profile.tsx status colors).
export function presenceColor(presence?: string | null): string {
  if (presence === 'BUSY') return '#ef4444';
  if (presence === 'AWAY') return '#f59e0b';
  return '#22c55e'; // AVAILABLE / default
}

// Profile avatar button for header right — shows the user's photo (or initials)
// with an availability status dot.
export function ProfileButton() {
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const initial = initialOf(user);
  // The same picture and the same destination as every amazen header's avatar.
  const { avatarUrl, openProfile } = useProfileAvatar();

  const handlePressIn = () => {
    Animated.spring(scaleAnim, { toValue: 0.88, friction: 5, useNativeDriver: true }).start();
  };
  const handlePressOut = () => {
    Animated.spring(scaleAnim, { toValue: 1, friction: 4, useNativeDriver: true }).start();
  };

  return (
    <Pressable onPress={openProfile} onPressIn={handlePressIn} onPressOut={handlePressOut} style={styles.profileBtn}>
      <TourTarget name="tab-profile">
        <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
          <View
            style={[
              styles.profileAvatar,
              { backgroundColor: avatarUrl ? colors.surface : isDark ? COLORS.primary + '25' : COLORS.primary },
            ]}
          >
            {avatarUrl ? (
              <CachedImage uri={avatarUrl} style={styles.profileImage} />
            ) : (
              <Text style={[styles.profileInitials, { color: isDark ? COLORS.primary : '#fff' }]}>{initial}</Text>
            )}
          </View>
          {/* Availability status dot */}
          <View
            style={[
              styles.statusDot,
              { backgroundColor: presenceColor(user?.presence), borderColor: colors.background },
            ]}
          />
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
export function CustomTabBar({ state, descriptors, navigation }: TabBarProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const chatUnread = useChatBadge();
  /*
    ⚠️ WHO GETS WHICH TAB IS ONE FUNCTION — `tabVisible` in tab-layout.ts —
    read here, by the navigator's `href`s below and by the More page. Three
    inline copies is how the bar hides a tab More still offers.
  */
  const access = useMemo(() => tabAccessFor(user as never), [user]);
  const visibleRoutes = state.routes.filter((route) => tabVisible(route.name, access));

  /*
    Split into what fits and what does not.

    Cheap by construction — at most seven items, sorted and sliced — but it runs
    on every navigation, so it is memoised on the route names rather than the
    route objects, which React Navigation recreates each time.
  */
  const routeNames = visibleRoutes.map((r) => r.name).join(',');
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
  const inOverflow = currentRoute?.name === 'more' || overflowRoutes.some((r) => r.key === currentRoute?.key);

  const getAdjustedIndex = () => barRoutes.findIndex((r) => r.key === currentRoute.key);

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
        items={barRoutes.map((route, index) => ({
          key: route.key,
          name: route.name,
          label: descriptors[route.key].options.title || route.name,
          focused: getAdjustedIndex() === index,
          tourKey: TAB_TOUR_KEY[route.name],
          // Team holds Messages: its unread count sits on the tab.
          badge: route.name === 'team' && chatUnread > 0 ? chatUnread : undefined,
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

export const styles = StyleSheet.create({
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
  tabBarOuter: {},
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
