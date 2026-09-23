import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/auth-context';
import { useTheme } from '../contexts/theme-context';
import { Ground, AText, WidgetFrame } from '../components/amazen';
import { OfflineBanner } from '../offline/components/offline-banner';
import { composeHome } from './registry';

/**
 * ONE home screen, composed from a registry.
 *
 * There used to be four — `admin-dashboard`, `hybrid-home`, `freelancer-home`,
 * `full-time-home` — each with its own fetching, skeletons and error handling.
 * The duplication was not theoretical: ALL FOUR carried the same "one unguarded
 * call kills the whole screen" bug, because the logic was written four times
 * and fixed once.
 *
 * ⚠️ EACH WIDGET FAILS ALONE. `WidgetFrame` is an error boundary per row, so a
 * widget that cannot load takes itself off the screen and never the shift card
 * beside it.
 *
 * ⚠️ AND A ROW YOU CANNOT SEE MAKES NO REQUEST AT ALL. Entitlement is asked
 * before the component mounts — nothing is visible-then-refused, and nothing
 * fetches to discover it was not allowed.
 */
export function HomeScreen() {
  const { user } = useAuth();
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    // Each widget owns its own data and re-reads on mount; remounting the
    // column is one gesture wired to all of them without a coordinator that
    // would have to know what every widget fetches.
    setRefreshKey((k) => k + 1);
    setTimeout(() => setRefreshing(false), 400);
  }, []);

  const rows = composeHome(user);
  const name = (user?.firstName || '').trim();

  return (
    <Ground variant="home">
      <ScrollView
        contentContainerStyle={{
          // ⚠️ No status bar is ever drawn — the gradient runs under it.
          paddingTop: Math.max(insets.top, amazen.space(3)) + amazen.space(4),
          paddingHorizontal: amazen.layout.gutter,
          /*
            ⚠️ NOT `layout.tabSafe` (110). That token is for a screen drawing
            UNDER the tab pill, and the pill renders in flow — the scene stops
            above it, so 110 here would be 110pt of dead scroll at the bottom
            of every home.
          */
          paddingBottom: amazen.space(6),
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={amazen.color.accent}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/*
          ⚠️ ONE line that says what the network is doing, for the whole
          column. Per widget it would be four copies of the same sentence; per
          screen it is the context every widget's own freshness label reads
          against.
        */}
        <OfflineBanner style={{ marginBottom: amazen.space(3) }} />

        <View style={{ marginBottom: amazen.space(6) }}>
          <AText variant="caption" tone="onGradient">{t(greetingKey(), { defaultValue: 'Hello' })}</AText>
          <AText variant="h2" tone="strong">{name || t('common.greeting.there', { defaultValue: 'there' })}</AText>
        </View>

        {rows.map((row, i) => (
          <WidgetFrame key={`${row.key}:${refreshKey}`} index={i}>
            <row.Component />
          </WidgetFrame>
        ))}
      </ScrollView>
    </Ground>
  );
}

function greetingKey(): string {
  const h = new Date().getHours();
  if (h < 12) return 'common.greeting.morning';
  if (h < 18) return 'common.greeting.afternoon';
  return 'common.greeting.evening';
}
