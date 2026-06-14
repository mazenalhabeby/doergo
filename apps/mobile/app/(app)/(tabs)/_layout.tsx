import { View, Text, StyleSheet, Platform, Pressable, Animated, TouchableOpacity } from 'react-native';
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
import { Role, hasModule } from '@hbcfield/shared/client';

// Logo icon for header left
function HeaderLogo() {
  return (
    <View style={styles.headerLeft}>
      <AnimatedLogo size="small" iconOnly />
    </View>
  );
}

// Profile avatar button for header right — modern floating style
function ProfileButton() {
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const initial = user?.firstName?.[0]?.toUpperCase() || '?';

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
      <Animated.View style={[
        styles.profileAvatar,
        {
          backgroundColor: isDark ? COLORS.primary + '25' : COLORS.primary,
          transform: [{ scale: scaleAnim }],
        },
      ]}>
        <Text style={[styles.profileInitials, { color: isDark ? COLORS.primary : '#fff' }]}>{initial}</Text>
      </Animated.View>
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
  } else {
    iconName = isFocused ? 'person' : 'person-outline';
  }

  return (
    <Pressable
      style={styles.tabItem}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      <Animated.View
        style={[
          styles.tabIconWrapper,
          isFocused && { backgroundColor: themeColors.primaryLight },
          { transform: [{ scale: scaleAnim }] },
        ]}
      >
        <Ionicons
          name={iconName as any}
          size={22}
          color={isFocused ? COLORS.primary : themeColors.textMuted}
        />
      </Animated.View>
      <Text style={[styles.tabLabel, { color: themeColors.textMuted }, isFocused && styles.tabLabelActive]}>
        {label}
      </Text>
      <Animated.View
        style={[
          styles.activeIndicator,
          {
            opacity: indicatorAnim,
            transform: [{ scaleX: indicatorAnim }],
          },
        ]}
      />
    </Pressable>
  );
}

// Custom Tab Bar - Full width premium design
function CustomTabBar({ state, descriptors, navigation }: any) {
  const insets = useSafeAreaInsets();
  const { colors: themeColors } = useTheme();
  const { user } = useAuth();
  const isAdmin = user?.role === Role.ADMIN || user?.role === 'CLIENT';
  const isTechnician = user?.role === Role.TECHNICIAN;
  // Module-based tab visibility
  const showTechTasks = hasModule(user || {}, 'tasks');
  const showAttendance = isTechnician && hasModule(user || {}, 'clock');

  // Filter routes based on role and modules (profile is in header, not tab bar)
  const visibleRoutes = state.routes.filter((route: any) => {
    if (route.name === 'profile') return false;
    if (isAdmin) {
      if (route.name === 'attendance') return false;
      if (route.name === 'time-off') return false;
      return true;
    }
    // TECHNICIAN: no manage, create-task only if permitted
    if (route.name === 'manage') return false;
    if (route.name === 'create-task') return !!user?.canCreateTasks;
    if (route.name === 'tasks') return showTechTasks;
    if (route.name === 'attendance') return showAttendance;
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
      borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
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
  const isAdmin = user?.role === Role.ADMIN || user?.role === 'CLIENT';
  const isTechnician = user?.role === Role.TECHNICIAN;
  const showTechTasks = hasModule(user || {}, 'tasks');
  const showAttendance = isTechnician && hasModule(user || {}, 'clock');

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
            href: (isAdmin || user?.canCreateTasks) ? '/create-task' : null,
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
        {/* Time Off tab - TECHNICIAN only */}
        <Tabs.Screen
          name="time-off"
          options={{
            title: t('tabs.timeOff'),
            href: isTechnician ? '/time-off' : null,
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
  },
  profileInitials: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  // Glassmorphism Tab Bar
  tabBarOuter: {
  },
  tabBarInner: {
    flexDirection: 'row',
    paddingTop: 10,
    paddingHorizontal: 16,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
  },
  tabIconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 4,
  },
  tabLabelActive: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  activeIndicator: {
    position: 'absolute',
    bottom: 0,
    width: 24,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: COLORS.primary,
  },
});
