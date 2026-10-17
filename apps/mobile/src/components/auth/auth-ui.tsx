import React, { useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, TextInput, View, type TextInputProps } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { useResponsive } from '../../lib/responsive';
import { AText, Ground } from '../amazen';
import { AnimatedLogo } from '../animated-logo';
import { centeredContent } from '../screen-container';

/**
 * The doors into the app — sign in, create an account, forgot password — on
 * the same ground as everything inside it. They were white cards under a
 * slate header with drifting orbs: the first screen of the app looked like
 * a different app from the one you then used.
 */
export function AuthFrame({ children, footer, compact }: { children: React.ReactNode; footer?: React.ReactNode; compact?: boolean }) {
  const { amazen } = useTheme();
  const insets = useSafeAreaInsets();
  const r = useResponsive();
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
              paddingTop: insets.top + amazen.space(compact ? 6 : 12),
              paddingBottom: insets.bottom + amazen.space(6),
              gap: amazen.space(4),
            },
            r.isTablet && centeredContent(460),
          ]}
        >
          <View style={{ alignItems: 'center', gap: amazen.space(2), paddingBottom: amazen.space(2) }}>
            <AnimatedLogo size={compact ? 'default' : 'large'} variant="light" />
          </View>
          {children}
          <View style={{ flex: 1 }} />
          {footer}
        </ScrollView>
      </KeyboardAvoidingView>
    </Ground>
  );
}

/** The one card that holds the form. */
export function AuthCard({ title, sub, children }: { title?: string; sub?: string; children: React.ReactNode }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  return (
    <View
      style={{
        backgroundColor: c.glass,
        borderWidth: 1,
        borderColor: c.lineGlass,
        borderRadius: 26,
        padding: amazen.space(4.5),
        gap: amazen.space(3),
      }}>
      {title ? <AText variant="h2" tone="strong" style={{ fontSize: 21, fontFamily: amazen.font.sansLight }}>{title}</AText> : null}
      {sub ? <AText variant="body" tone="onGlass" style={{ fontSize: 13.5, marginTop: -amazen.space(1.5) }}>{sub}</AText> : null}
      {children}
    </View>
  );
}

/**
 * A labelled field, with Show/Hide for a password and its error UNDER it —
 * in words, where the eye already is, instead of a toast over the form.
 */
export function AuthField({ label, error, secure, ...input }: TextInputProps & { label: string; error?: string; secure?: boolean }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t } = useTranslation();
  const [shown, setShown] = useState(false);
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <AText
        style={{
          color: c.inkOnGlass,
          fontFamily: amazen.font.mono,
          fontSize: 10,
          letterSpacing: 1.3,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </AText>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: c.sunken,
          borderRadius: 14,
          borderWidth: 1.5,
          borderColor: error ? c.critical : focus ? c.accent : c.lineWell,
          paddingHorizontal: amazen.space(3.5),
        }}>
        <TextInput
          placeholderTextColor={c.inkMuted}
          autoCorrect={false}
          {...input}
          secureTextEntry={secure && !shown}
          onFocus={(e) => { setFocus(true); input.onFocus?.(e); }}
          onBlur={(e) => { setFocus(false); input.onBlur?.(e); }}
          style={{ flex: 1, color: c.inkStrong, fontFamily: amazen.font.sans, fontSize: 15, paddingVertical: amazen.space(3) }}
          accessibilityLabel={label}
        />
        {secure ? (
          <Pressable onPress={() => setShown((s) => !s)} hitSlop={10} accessibilityRole="button">
            <AText variant="caption" style={{ color: c.accent, fontSize: 13 }}>
              {shown ? t('settings.account.hide', 'Hide') : t('settings.account.show', 'Show')}
            </AText>
          </Pressable>
        ) : null}
      </View>
      {error ? <AText variant="caption" style={{ color: c.critical, lineHeight: 17 }}>{error}</AText> : null}
    </View>
  );
}

/** "New here? Create an account" — words and a link on one line. */
export function AuthLinkLine({ text, link, onPress }: { text: string; link: string; onPress: () => void }) {
  const { amazen } = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 4 }}>
      <AText variant="body" tone="onGlass" style={{ fontSize: 13.5 }}>{text}</AText>
      <Pressable onPress={onPress} hitSlop={8} accessibilityRole="link">
        <AText variant="body" style={{ fontSize: 13.5, color: amazen.color.accent }}>{link}</AText>
      </Pressable>
    </View>
  );
}

/** "Need help? Contact support" — it had no link at all; it opens the help centre now. */
export function AuthHelp() {
  const { t } = useTranslation();
  return (
    <AuthLinkLine
      text={t('auth.login.needHelp')}
      link={t('auth.login.contactSupport')}
      onPress={() => void Linking.openURL('https://hbcfield.com/help').catch(() => undefined)}
    />
  );
}
