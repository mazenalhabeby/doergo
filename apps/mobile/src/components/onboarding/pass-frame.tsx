import React from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { useAuth } from '../../contexts/auth-context';
import { useResponsive } from '../../lib/responsive';
import { AText, Ground } from '../amazen';
import { centeredContent } from '../screen-container';

/**
 * The frame every onboarding state shares: a heading that says where you
 * stand, the pass, then what you can do with it. Sign out stays at the foot
 * of every state — an account created with the wrong address must never be
 * stuck here.
 */
export function PassFrame({ heading, children, dock }: { heading: string; children: React.ReactNode; dock: React.ReactNode }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const insets = useSafeAreaInsets();
  const r = useResponsive();
  const { t } = useTranslation();
  const { logout } = useAuth();
  return (
    <Ground style={{ flex: 1 }}>
      <StatusBar style="light" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            {
              flexGrow: 1,
              paddingHorizontal: amazen.space(4),
              paddingTop: insets.top + amazen.space(4),
              paddingBottom: insets.bottom + amazen.space(4),
              gap: amazen.space(3),
            },
            r.isTablet && centeredContent(460),
          ]}
        >
          <View style={{ gap: 2 }}>
            <AText
              style={{
                color: c.inkOnGlass,
                fontFamily: amazen.font.mono,
                fontSize: 10,
                letterSpacing: 1.6,
                textTransform: 'uppercase',
              }}
            >
              {t('onboarding.pass.eyebrow')}
            </AText>
            <AText variant="h2" tone="strong" style={{ fontSize: 26, lineHeight: 32, fontFamily: amazen.font.sansLight }}>{heading}</AText>
          </View>
          {children}
          <View style={{ flex: 1, minHeight: amazen.space(2) }} />
          <View style={{ gap: amazen.space(3) }}>
            {dock}
            <Pressable onPress={() => void logout()} hitSlop={10} accessibilityRole="button" style={{ alignSelf: 'center' }}>
              <AText variant="caption" tone="onGlass" style={{ fontSize: 13 }}>{t('onboarding.pass.signOut')}</AText>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Ground>
  );
}

/** The two quiet ways out, side by side under the main button. */
export function PassAlternatives({ items }: { items: { label: string; onPress: () => void }[] }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: amazen.space(2), flexWrap: 'wrap' }}>
      {items.map((it) => (
        <Pressable
          key={it.label}
          onPress={it.onPress}
          accessibilityRole="button"
          style={({ pressed }) => ({
            opacity: pressed ? 0.6 : 1,
            borderWidth: 1,
            borderColor: c.lineGlass,
            backgroundColor: c.glass,
            borderRadius: 999,
            paddingHorizontal: amazen.space(3.5),
            paddingVertical: amazen.space(2),
          })}>
          <AText variant="body" tone="strong" style={{ fontSize: 13.5 }}>{it.label}</AText>
        </Pressable>
      ))}
    </View>
  );
}
