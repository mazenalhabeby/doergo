import { View, Text, StyleSheet, Platform, Pressable, Animated } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRef, useEffect } from 'react';
import { TokenMonitor, AnimatedLogo } from '../../../src/components';
import { useAuth } from '../../../src/contexts/auth-context';

const PRIMARY_COLOR = '#2563EB';

// Custom header with Doergo logo
function LogoHeader({ subtitle }: { subtitle: string }) {
  return (
    <View style={styles.headerContent}>
      <AnimatedLogo size="small" />
      <Text style={styles.headerSubtitle}>{subtitle}</Text>
    </View>
  );
}

// Premium header style configuration
const headerConfig = {
  headerStyle: {
    backgroundColor: 'white',
    elevation: 0,
    shadowOpacity: 0,
    borderBottomWidth: 0,
  },
  headerShadowVisible: false,
  headerTitleAlign: 'center' as const,
};

// Animated Tab Item
function TabItem({
  route,
  label,
  isFocused,
  onPress,
}: {
  route: any;
  label: string;
  isFocused: boolean;
  onPress: () => void;
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
          isFocused && styles.tabIconWrapperActive,
          { transform: [{ scale: scaleAnim }] },
        ]}
      >
        <Ionicons
          name={iconName as any}
          size={22}
          color={isFocused ? PRIMARY_COLOR : '#9ca3af'}
        />
      </Animated.View>
      <Text style={[styles.tabLabel, isFocused && styles.tabLabelActive]}>
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
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'CLIENT';
  const isTechnician = user?.role === 'TECHNICIAN';
  // Work mode determines tab visibility for technicians
  const workMode = user?.workMode || 'HYBRID';
  const showTechTasks = workMode === 'ON_ROAD' || workMode === 'HYBRID';
  const showAttendance = isTechnician && (workMode === 'ON_SITE' || workMode === 'HYBRID');

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
    <View style={[styles.tabBarContainer, { paddingBottom: insets.bottom }]}>
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
            />
          );
        })}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'CLIENT';
  const isTechnician = user?.role === 'TECHNICIAN';
  const workMode = user?.workMode || 'HYBRID';
  const showTechTasks = workMode === 'ON_ROAD' || workMode === 'HYBRID';
  const showAttendance = isTechnician && (workMode === 'ON_SITE' || workMode === 'HYBRID');

  return (
    <View style={styles.container}>
      {/* Status bar with dark icons for white header */}
      <StatusBar style="dark" backgroundColor="white" />

      <Tabs
        tabBar={(props) => <CustomTabBar {...props} />}
        screenOptions={{
          ...headerConfig,
          tabBarHideOnKeyboard: true,
        }}
        sceneContainerStyle={{ backgroundColor: '#f8fafc' }}
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

      {/* Token Monitor - only in development */}
      {__DEV__ && <TokenMonitor />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  headerContent: {
    alignItems: 'center',
    paddingTop: 4,
    paddingBottom: 14,
  },
  headerSubtitle: {
    fontSize: 10,
    fontWeight: '500',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginTop: 6,
  },
  // Premium Full-Width Tab Bar
  tabBarContainer: {
    backgroundColor: 'white',
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
  tabIconWrapperActive: {
    backgroundColor: '#eff6ff',
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: '#9ca3af',
    marginTop: 4,
  },
  tabLabelActive: {
    color: PRIMARY_COLOR,
    fontWeight: '600',
  },
  activeIndicator: {
    position: 'absolute',
    bottom: 0,
    width: 24,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: PRIMARY_COLOR,
  },
});
