import { View, Text, StyleSheet, Platform, Pressable, Animated, TouchableOpacity, Image } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatedLogo } from '../../../src/components';
import { useAuth } from '../../../src/contexts/auth-context';
import { useTheme } from '../../../src/contexts/theme-context';
import { COLORS, SPACING, FONT_SIZE, FONT_WEIGHT } from '../../../src/lib/constants';
import { TourTarget, useTourTarget } from '../../../src/components/tour';
import { Role, hasAccessModule, normalizeRole, canContactColleagues } from '@hbcfield/shared/client';
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

  let iconName: string;
  if (route.name === 'index') {
    iconName = isFocused ? 'home' : 'home-outline';
  } else if (route.name === 'tasks') {
    iconName = isFocused ? 'clipboard' : 'clipboard-outline';
  } else if (route.name === 'create-task') {
    iconName = isFocused ? 'add-circle' : 'add-circle-outline';
  } else if (route.name === 'manage') {
    iconName = isFocused ? 'grid' : 'grid-outline';
  } else if (route.name === 'attendance') {
    iconName = isFocused ? 'time' : 'time-outline';
  } else if (route.name === 'time-off') {
    iconName = isFocused ? 'calendar' : 'calendar-outline';
  } else if (route.name === 'team') {
    iconName = isFocused ? 'people' : 'people-outline';
  } else {
    iconName = isFocused ? 'person' : 'person-outline';
  }

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
  const { colors: themeColors } = useTheme();
  const { user } = useAuth();
  const isAdmin = normalizeRole(user?.role || '') === Role.ADMIN;
  // Tab visibility is driven by the per-user Access Profile. hasAccessModule
  // defaults to ON for users without a profile (admins/managers), so the admin
  // branch below still governs their tabs.
  const showTasks = hasAccessModule(user || {}, 'tasks');
  const showAttendance = hasAccessModule(user || {}, 'clock');
  const showTimeOff = hasAccessModule(user || {}, 'time_off');
  const showCreate = hasAccessModule(user || {}, 'create_task') && !!user?.canCreateTasks;
  const showTeam = canContactColleagues(user || {});

  // Filter routes based on role and modules (profile is in header, not tab bar)
  const visibleRoutes = state.routes.filter((route: any) => {
    if (route.name === 'profile') return false;
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
    // Employees: no manage; create-task by module + permission; rest by module.
    if (route.name === 'manage') return false;
    if (route.name === 'create-task') return showCreate;
    if (route.name === 'tasks') return showTasks;
    if (route.name === 'attendance') return showAttendance;
    if (route.name === 'time-off') return showTimeOff;
    return true;
  });

  // Calculate adjusted focus index
  const getAdjustedIndex = () => {
    const currentRoute = state.routes[state.index];
    return visibleRoutes.findIndex((r: any) => r.key === currentRoute.key);
  };

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
        {visibleRoutes.map((route: any, index: number) => {
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
      </View>
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
  const showCreate = hasAccessModule(user || {}, 'create_task') && !!user?.canCreateTasks;
  const showTeam = canContactColleagues(user || {});

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor={colors.header} />

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
            title: isAdmin ? t('tabs.dashboard') : t('tabs.home'),
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
        {/* Manage tab - ADMIN only */}
        <Tabs.Screen
          name="manage"
          options={{
            title: t('tabs.manage'),
            href: isAdmin ? '/manage' : null,
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
