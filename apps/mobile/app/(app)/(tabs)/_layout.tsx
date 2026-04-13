import { View, Text, StyleSheet, Platform, Pressable, Animated } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRef, useEffect } from 'react';
import { AnimatedLogo } from '../../../src/components';
import { useAuth } from '../../../src/contexts/auth-context';
import { useTheme } from '../../../src/contexts/theme-context';
import { COLORS } from '../../../src/lib/constants';
import { Role, WorkMode } from '@hbcfield/shared/client';

// Custom header with HBCField logo
function LogoHeader({ subtitle }: { subtitle: string }) {
  const { colors, isDark } = useTheme();
  return (
    <View style={styles.headerContent}>
      <AnimatedLogo size="small" variant={isDark ? 'light' : undefined} />
      <Text style={[styles.headerSubtitle, { color: colors.textMuted }]}>{subtitle}</Text>
    </View>
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
  // Work mode determines tab visibility for technicians
  const userWorkMode = user?.workMode || WorkMode.HYBRID;
  const showTechTasks = userWorkMode === WorkMode.ON_ROAD || userWorkMode === WorkMode.HYBRID;
  const showAttendance = isTechnician && (userWorkMode === WorkMode.ON_SITE || userWorkMode === WorkMode.HYBRID);

  // Filter routes based on role and work mode
  const visibleRoutes = state.routes.filter((route: any) => {
    if (isAdmin) {
      // ADMIN sees: Dashboard, Tasks, Create, Profile
      if (route.name === 'attendance') return false;
      if (route.name === 'time-off') return false;
      return true;
    }
    // TECHNICIAN: existing workMode-based logic
    if (route.name === 'create-task') return false;
    if (route.name === 'tasks') return showTechTasks;
    if (route.name === 'attendance') return showAttendance;
    return true;
  });

  // Calculate adjusted focus index
  const getAdjustedIndex = () => {
    const currentRoute = state.routes[state.index];
    return visibleRoutes.findIndex((r: any) => r.key === currentRoute.key);
  };

  return (
    <View style={[styles.tabBarContainer, { paddingBottom: insets.bottom, backgroundColor: themeColors.tabBar }]}>
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
  const isAdmin = user?.role === Role.ADMIN || user?.role === 'CLIENT';
  const isTechnician = user?.role === Role.TECHNICIAN;
  const userWorkMode = user?.workMode || WorkMode.HYBRID;
  const showTechTasks = userWorkMode === WorkMode.ON_ROAD || userWorkMode === WorkMode.HYBRID;
  const showAttendance = isTechnician && (userWorkMode === WorkMode.ON_SITE || userWorkMode === WorkMode.HYBRID);

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
          tabBarHideOnKeyboard: true,
          sceneStyle: { backgroundColor: colors.surface },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: isAdmin ? 'Dashboard' : 'Home',
            headerTitle: () => <LogoHeader subtitle={isAdmin ? 'Dashboard' : 'Home'} />,
          }}
        />
        {/* Tasks tab - ADMIN always sees, TECHNICIAN based on workMode */}
        <Tabs.Screen
          name="tasks"
          options={{
            title: 'Tasks',
            headerTitle: () => <LogoHeader subtitle="Tasks" />,
            href: isAdmin || showTechTasks ? '/tasks' : null,
          }}
        />
        {/* Create Task tab - ADMIN only */}
        <Tabs.Screen
          name="create-task"
          options={{
            title: 'Create',
            headerTitle: () => <LogoHeader subtitle="Create Task" />,
            href: isAdmin ? '/create-task' : null,
          }}
        />
        {/* Clock tab - TECHNICIAN only, based on workMode */}
        <Tabs.Screen
          name="attendance"
          options={{
            title: 'Clock',
            headerTitle: () => <LogoHeader subtitle="Attendance" />,
            href: showAttendance ? '/attendance' : null,
          }}
        />
        {/* Time Off tab - TECHNICIAN only */}
        <Tabs.Screen
          name="time-off"
          options={{
            title: 'Time Off',
            headerTitle: () => <LogoHeader subtitle="Time Off" />,
            href: isTechnician ? '/time-off' : null,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            headerTitle: () => <LogoHeader subtitle="Profile" />,
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
  headerContent: {
    alignItems: 'center',
    paddingTop: 4,
    paddingBottom: 14,
  },
  headerSubtitle: {
    fontSize: 10,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginTop: 6,
  },
  // Premium Full-Width Tab Bar
  tabBarContainer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 16,
  },
  tabBarInner: {
    flexDirection: 'row',
    paddingTop: 8,
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
