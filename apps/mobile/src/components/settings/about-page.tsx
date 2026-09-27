import React from 'react';
import { Linking, Pressable, Share, View } from 'react-native';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import * as Updates from 'expo-updates';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { useVersionStatus } from '../../contexts/version-context';
import { openUpdate } from '../../lib/in-app-updates';
import { formatDay } from '../../lib/money';
import { AText, PrimaryButton, Well } from '../amazen';
import { SectionLabel } from '../job/job-ui';
import { SettingsPage } from './settings-ui';

/**
 * ABOUT — is my app up to date, what is this app, and (for support) exactly
 * which build this is.
 *
 * ⚠️ The build codes WERE the page: "Update: 3d02fd62" means nothing to the
 * person holding the phone, while the one thing they want to know — is there
 * a newer version — was only ever a green tint on the profile row. The answer
 * is first now, in words, with Update; the codes are last, for support, with
 * one button that copies them into a message.
 *
 * Terms and privacy live here too — the profile's Legal group was three rows
 * for two links and this page.
 */
export function AboutPage() {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t, i18n } = useTranslation();
  const { status } = useVersionStatus();
  const lang = i18n.language;

  const version = Constants.expoConfig?.version || '1.0.0';
  const extra = (Constants.expoConfig?.extra ?? {}) as { gitCommit?: string; buildProfile?: string; builtAt?: string };
  const commit = (extra.gitCommit || 'unknown').slice(0, 8);
  const profile = extra.buildProfile || 'local';
  const builtAt = extra.builtAt ? formatDay(extra.builtAt, lang) : '—';
  /*
    Which JavaScript is running: the version above is the BINARY's and does not
    move when an update is delivered. `isEmbeddedLaunch` = no update applied.
  */
  const updateId = Updates.isEmbeddedLaunch ? null : (Updates.updateId ?? '').slice(0, 8) || null;
  const updateAt = !Updates.isEmbeddedLaunch && Updates.createdAt ? formatDay(new Date(Updates.createdAt).toISOString(), lang) : null;

  const behind = !!status?.updateAvailable && !!status.latest;
  const facts: [string, string][] = [
    [t('settings.about.version', 'Version'), version],
    [t('settings.about.build', 'Build'), `${profile} · ${commit}`],
    [t('settings.about.built', 'Built'), builtAt],
    [t('settings.about.update', 'Update'), updateId ? `${updateId}${updateAt ? ` · ${updateAt}` : ''}` : t('profile.about.noUpdate')],
  ];
  const copy = () => void Share.share({ message: `HBCField ${facts.map(([k, v]) => `${k}: ${v}`).join(' | ')}` });

  return (
    <SettingsPage title={t('profile.about.title', 'About')}>
      <View style={{ alignItems: 'center', gap: amazen.space(1.5), paddingVertical: amazen.space(2) }}>
        <View style={{ width: 76, height: 76, borderRadius: 22, backgroundColor: c.accentTint, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="construct" size={34} color={c.accent} />
        </View>
        <AText variant="h2" tone="strong" style={{ fontSize: 22 }}>{t('common.appName', 'HBCField')}</AText>
        <AText style={{ color: c.inkOnGlass, fontFamily: amazen.font.mono, fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase' }}>{t('profile.about.tagline')}</AText>
      </View>

      {/* The answer first: up to date, or not — in words. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(3), padding: amazen.space(3.5), borderRadius: 20, backgroundColor: behind ? c.warnTint : c.accentTint }}>
        <View style={{ width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: behind ? c.warnTint : c.accentTint }}>
          <Ionicons name={behind ? 'arrow-up' : 'checkmark'} size={19} color={behind ? c.warn : c.accent} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <AText variant="body" tone="strong" style={{ fontSize: 15 }}>
            {behind ? t('settings.about.ready', { version: status!.latest, defaultValue: 'Version {{version}} is ready' }) : t('settings.about.upToDate', 'Up to date')}
          </AText>
          <AText variant="caption" tone="muted">
            {behind
              ? t('settings.about.youHave', { version, defaultValue: 'You have {{version}}. The store has the new one.' })
              : updateAt
                ? t('settings.about.received', { version, date: updateAt, defaultValue: 'Version {{version}} · latest improvements received {{date}}' })
                : t('settings.about.versionOnly', { version, defaultValue: 'Version {{version}}' })}
          </AText>
        </View>
      </View>
      {behind && status?.downloadUrl ? <PrimaryButton label={t('settings.bio.update', 'Update')} onPress={() => void openUpdate(status.downloadUrl)} /> : null}

      <Well style={{ padding: amazen.space(3.5) }}>
        <AText variant="body" tone="ink" style={{ fontSize: 13.5, lineHeight: 20 }}>{t('profile.about.description')}</AText>
      </Well>

      <Well style={{ paddingHorizontal: amazen.space(3.5) }}>
        {[
          [t('profile.menu.termsOfService', 'Terms of service'), 'https://hbcfield.com/terms'],
          [t('profile.menu.privacyPolicy', 'Privacy policy'), 'https://hbcfield.com/privacy'],
        ].map(([label, url], i) => (
          <Pressable key={url} onPress={() => void Linking.openURL(url).catch(() => undefined)} accessibilityRole="link"
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', paddingVertical: amazen.space(3), borderTopWidth: i === 0 ? 0 : 1, borderTopColor: c.lineWell, opacity: pressed ? 0.75 : 1 })}>
            <AText variant="body" tone="strong" style={{ flex: 1, fontSize: 14.5 }}>{label}</AText>
            <Ionicons name="open-outline" size={17} color={c.inkMuted} />
          </Pressable>
        ))}
      </Well>

      <SectionLabel style={{ paddingHorizontal: amazen.space(1), paddingTop: amazen.space(2) }}>{t('settings.about.forSupport', 'For support')}</SectionLabel>
      <Well style={{ paddingHorizontal: amazen.space(3.5) }}>
        {facts.map(([k, v], i) => (
          <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: amazen.space(2.5), borderTopWidth: i === 0 ? 0 : 1, borderTopColor: c.lineWell }}>
            <AText variant="caption" tone="muted">{k}</AText>
            <AText selectable numberOfLines={1} style={{ flexShrink: 1, textAlign: 'right', fontFamily: amazen.font.mono, fontSize: 12.5, color: c.ink }}>{v}</AText>
          </View>
        ))}
      </Well>
      <Pressable onPress={copy} accessibilityRole="button" style={({ pressed }) => ({ alignSelf: 'center', borderRadius: amazen.radius.full, backgroundColor: c.tile, paddingHorizontal: 18, paddingVertical: 10, opacity: pressed ? 0.8 : 1 })}>
        <AText variant="body" tone="strong" style={{ fontSize: 13.5 }}>{t('settings.about.copy', 'Copy for support')}</AText>
      </Pressable>
      <AText variant="caption" tone="onGlass" style={{ textAlign: 'center' }}>{t('common.copyrightYear', { year: new Date().getFullYear() })}</AText>
    </SettingsPage>
  );
}
