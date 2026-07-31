import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../../src/contexts/theme-context';
import { COLORS } from '../../../src/lib/constants';

export default function CustomerTabsLayout() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  // Grow the tab bar by the bottom inset so it never sits under the Android nav
  // bar / iOS home indicator. insets.bottom is 0 on devices without one, so the
  // bar keeps its base height there.
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopColor: colors.border,
          height: 62 + insets.bottom,
          paddingBottom: 8 + insets.bottom,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontFamily: 'Outfit_400Regular', fontSize: 11 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('portal.tabs.home', 'Home'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="requests"
        options={{
          title: t('portal.tabs.requests', 'Requests'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'clipboard' : 'clipboard-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: t('portal.tabs.messages', 'Messages'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'chatbubble' : 'chatbubble-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('portal.tabs.profile', 'Profile'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'person' : 'person-outline'} size={22} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
