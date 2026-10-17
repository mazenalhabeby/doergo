import React, { useState, useCallback, useEffect, useRef } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, View } from 'react-native';
import { CachedImage } from '../cached-image';
import { useTranslation } from 'react-i18next';
import { router, type Href, useFocusEffect } from 'expo-router';
import Constants from 'expo-constants';
import { orgHasAddOn, Role, personName } from '@hbcfield/shared/client';
import { uuidv7 } from '../../offline/ids';
import type { AvatarChange } from '../../offline/profile/pending-avatar';
import { updateOwnProfile } from '../../offline/profile/profile-actions';
import { useOffline, useSyncStatus } from '../../offline/offline-context';
import { useVersionStatus } from '../../contexts/version-context';
import { openUpdate } from '../../lib/in-app-updates';
import { useAuth } from '../../contexts/auth-context';
import { getCurrentLanguage, supportedLanguages } from '../../i18n';
import { useTheme, type ThemeMode } from '../../contexts/theme-context';
import { useHeldAssets } from '../../hooks/use-held-assets';
import { useDocumentRequirements } from '../../contexts/document-requirements-context';
import { useToast } from '../../island/island-context';
import { useImagePicker } from '../../hooks/useImagePicker';
import { avatarApi, userApi, resolveMediaUrl } from '../../lib/api';
import { useResponsive } from '../../lib/responsive';
import { initialsOf } from '../../lib/people';
import { AText, GlassCard, Ground, HeaderBack, PrimaryButton, ScreenHeader, Well, WellDivider } from '../amazen';
import { centeredContent } from '../screen-container';
import { JobSheet, SectionLabel, SheetOption } from '../job/job-ui';
import { CameraGlyph, CloseGlyph, GalleryGlyph } from '../job/job-glyphs';
import { TourTarget, GuideSheet, useTourScroll } from '../tour';
import { PROFILE_GLYPHS } from './profile-glyphs';
import { useShift } from '../../offline/attendance/use-shift';
import { offersClockInPick, parseClockInPick } from '@hbcfield/shared/client';
import { hasUnsentLocalWork } from '../../lib/session/end-session';
import { useProfileScreen } from './use-profile-screen';
import { THEME_MODE_I18N, Group, Row } from './profile-screen-helpers';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProfileScreen() {
  const {
    user,
    offline,
    clockInOffered,
    syncSnapshot,
    showUnsentConfirm,
    setShowUnsentConfirm,
    amazen,
    mode,
    c,
    t,
    outstandingDocs,
    docsBlockWork,
    held,
    contractHere,
    avatarLoading,
    savingPresence,
    showSignOutConfirm,
    setShowSignOutConfirm,
    guidesOpen,
    setGuidesOpen,
    tourScroll,
    handleSetPresence,
    appVersion,
    versionStatus,
    shownAvatarUri,
    hasAvatar,
    handleRemoveAvatar,
    photoMenu,
    setPhotoMenu,
    handleAvatarPress,
    pickPhoto,
    handleAppearancePress,
    handleTimeFormatPress,
    handleLogout,
    confirmSignOut,
    wide,
    back,
    presence,
    lang,
    waitingOnPhone,
    roleLine,
  } = useProfileScreen();

  return (
    <Ground style={{ flex: 1 }}>
      {/* ⚠️ No avatar in the corner — you are on it. Back, because the tab bar is not drawn here. */}
      <ScreenHeader title={t('tabs.profile', 'Profile')} leading={<HeaderBack onPress={back} />} showAvatar={false} style={wide ?? undefined} />
      <ScrollView
        {...tourScroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[{ paddingHorizontal: amazen.space(4), paddingBottom: amazen.space(12), gap: amazen.space(3) }, wide]}
      >
        {/* ── You ── */}
        <TourTarget name="profile-header">
          <GlassCard style={{ alignItems: 'center', gap: amazen.space(2.5) }}>
            <Pressable onPress={handleAvatarPress} disabled={avatarLoading} accessibilityRole="button" accessibilityLabel={t('profile.profilePhoto')}>
              <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: c.accentTint, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                {avatarLoading ? (
                  <ActivityIndicator color={c.accent} />
                ) : shownAvatarUri ? (
                  <CachedImage uri={shownAvatarUri} style={{ width: 96, height: 96 }} />
                ) : (
                  <AText variant="h2" tone="accent" style={{ fontSize: 32, lineHeight: 40 }}>{initialsOf(user)}</AText>
                )}
              </View>
              <View style={{ position: 'absolute', right: -2, bottom: -2, width: 32, height: 32, borderRadius: 16, backgroundColor: c.accentSolid, borderWidth: 3, borderColor: c.well, alignItems: 'center', justifyContent: 'center' }}>
                <CameraGlyph size={14} color={c.accentInk} />
              </View>
            </Pressable>
            <View style={{ alignItems: 'center', gap: 2 }}>
              <AText variant="h2" tone="strong" numberOfLines={1} style={{ fontSize: 22, lineHeight: 28 }}>{personName(user)}</AText>
              {roleLine ? <AText variant="caption" tone="onGlass" numberOfLines={1} style={{ fontSize: 13 }}>{roleLine}</AText> : null}
              {user?.organizationName ? <SectionLabel tone="accent" style={{ marginTop: 4 }}>{user.organizationName}</SectionLabel> : null}
            </View>

            {/* Availability — one control, three answers. */}
            <TourTarget name="profile-availability" style={{ alignSelf: 'stretch' }}>
              <View style={{ flexDirection: 'row', gap: 4, padding: 4, borderRadius: amazen.radius.full, backgroundColor: c.sunken }}>
                {([
                  { value: 'AVAILABLE' as const, dot: '#22c55e', label: t('profile.status.available', 'Available') },
                  { value: 'BUSY' as const, dot: '#ef4444', label: t('profile.status.busy', 'Busy') },
                  { value: 'AWAY' as const, dot: '#f59e0b', label: t('profile.status.away', 'Away') },
                ]).map((o) => {
                  const on = presence === o.value;
                  return (
                    <Pressable
                      key={o.value}
                      onPress={() => void handleSetPresence(o.value)}
                      disabled={savingPresence || on}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: amazen.space(2.25), borderRadius: amazen.radius.full, backgroundColor: on ? c.tile : 'transparent' }}
                    >
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: o.dot }} />
                      <AText variant="caption" numberOfLines={1} style={{ fontSize: 13, color: on ? c.inkStrong : c.ink }}>{o.label}</AText>
                    </Pressable>
                  );
                })}
              </View>
            </TourTarget>
          </GlassCard>
        </TourTarget>

        {/*
          A newer version exists — the one row here that cannot be dismissed.
          ⚠️ The banner was the only channel and closes with one easy tap; this
          stays until the update is installed.
        */}
        {versionStatus?.updateAvailable && !!versionStatus.downloadUrl ? (
          <Pressable onPress={() => { void openUpdate(versionStatus.downloadUrl); }} accessibilityRole="button"
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: amazen.space(3), padding: amazen.space(3.5), borderRadius: 20, backgroundColor: c.accentTint, borderWidth: 1, borderColor: c.accent, opacity: pressed ? 0.85 : 1 })}>
            <PROFILE_GLYPHS.update size={22} color={c.accent} />
            <AText variant="body" tone="strong" style={{ flex: 1, fontSize: 14 }}>{t('profile.menu.updateAvailable', { version: versionStatus.latest })}</AText>
            <View style={{ borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: c.accentSolid }}>
              <AText variant="caption" tone="accentInk" style={{ fontFamily: amazen.font.sansMedium, fontSize: 13 }}>{t('updateBanner.action', 'Update')}</AText>
            </View>
          </Pressable>
        ) : null}

        {/* ── Yours ── */}
        <TourTarget name="profile-menu">
          <Group label={t('profile.group.yours', 'Yours')}>
            {held.length > 0 || contractHere ? <Row glyph="equipment" label={t('myAssets.title', 'My equipment')} count={held.length || undefined} onPress={() => router.push('/my-assets' as Href)} /> : null}
            {orgHasAddOn(user?.orgAddOns ?? null, 'documents') ? (
              <Row glyph="documents" label={t('profile.documents')} count={outstandingDocs} countTone={docsBlockWork ? 'critical' : 'warn'} onPress={() => router.push('/documents' as Href)} />
            ) : null}
            <Row
              glyph="sync"
              label={t('profile.menu.sync')}
              count={waitingOnPhone}
              countTone={syncSnapshot.attention > 0 ? 'critical' : 'warn'}
              value={waitingOnPhone ? undefined : t('profile.syncAllSent', 'All sent')}
              onPress={() => router.push('/sync' as Href)}
            />
          </Group>
        </TourTarget>

        {/* ── Settings — each row says what it is set to ── */}
        <TourTarget name="profile-settings">
        <Group label={t('profile.group.settings', 'Settings')}>
          <Row glyph="notifications" label={t('profile.menu.notifications')} onPress={() => router.push('/profile/notifications' as Href)} />
          <Row glyph="appearance" label={t('profile.menu.appearance')} value={t(THEME_MODE_I18N[mode])} onPress={handleAppearancePress} />
          {clockInOffered ? (
            <Row glyph="clockIn" label={t('profile.menu.clockIn', 'Clock in')} value={t(parseClockInPick(user?.clockInPick) === 'ASK' ? 'settings.clockIn.askShort' : 'settings.clockIn.autoShort')} onPress={() => router.push('/profile/clock-in' as Href)} />
          ) : null}
          <Row glyph="timeFormat" label={t('profile.menu.timeFormat')} value={t(`profile.timeFormat.${user?.timeFormat === '12h' ? '12h' : '24h'}`)} onPress={handleTimeFormatPress} />
          <Row glyph="language" label={t('profile.menu.language')} value={lang?.label} onPress={() => router.push('/profile/language' as Href)} />
          <Row glyph="account" label={t('profile.menu.accountSecurity')} onPress={() => router.push('/profile/account' as Href)} />
        </Group>
        </TourTarget>

        <Group label={t('profile.menu.support')}>
          <Row glyph="help" label={t('profile.menu.helpCenter')} onPress={() => Linking.openURL('https://hbcfield.com/help').catch(() => {})} />
          <Row glyph="support" label={t('profile.menu.contactSupport')} onPress={() => router.push('/support' as Href)} />
          <TourTarget name="profile-guide">
            <Row glyph="tour" label={t('profile.menu.guidedTour')} onPress={() => setGuidesOpen(true)} />
          </TourTarget>
          <Row glyph="rate" label={t('profile.menu.rateApp')} onPress={() => Linking.openURL('https://apps.apple.com').catch(() => {})} />
        </Group>

        {/* Terms and privacy live on About now: one row, not a group of three for two links. */}
        <Group label={t('profile.menu.about')}>
          <Row glyph="about" label={t('profile.menu.about')} value={versionStatus?.updateAvailable ? t('settings.about.updateShort', 'Update ready') : `v${appVersion}`} valueTone={versionStatus?.updateAvailable ? 'accent' : undefined} onPress={() => router.push('/profile/about' as Href)} />
        </Group>

        {/* ── Sign out, last ── */}
        <Pressable onPress={handleLogout} accessibilityRole="button"
          style={({ pressed }) => ({ marginTop: amazen.space(2), minHeight: amazen.layout.tapMin + 4, borderRadius: amazen.radius.full, backgroundColor: c.well, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
          <AText variant="body" tone="critical" style={{ fontSize: 15 }}>{t('profile.signOutButton')}</AText>
        </Pressable>
        <AText variant="caption" tone="muted" numeric style={{ textAlign: 'center' }}>{t('profile.versionFooter', { version: appVersion })}</AText>
      </ScrollView>

      {/* The photo — a sheet in the design system, not a platform alert. */}
      <JobSheet visible={photoMenu} onClose={() => setPhotoMenu(false)} title={t('profile.profilePhoto')}>
        <SheetOption Glyph={CameraGlyph} label={t('profile.takePhoto')} onPress={() => void pickPhoto('camera')} />
        <SheetOption Glyph={GalleryGlyph} label={t('profile.chooseFromGallery')} onPress={() => void pickPhoto('gallery')} />
        {hasAvatar ? <SheetOption Glyph={CloseGlyph} tone="critical" label={t('profile.removePhoto')} onPress={() => { setPhotoMenu(false); void handleRemoveAvatar(); }} /> : null}
      </JobSheet>

      <JobSheet visible={showSignOutConfirm} onClose={() => setShowSignOutConfirm(false)} title={t('profile.signOutConfirmTitle')}>
        <AText variant="body" tone="ink" style={{ fontSize: 14, lineHeight: 21 }}>{t('profile.signOutConfirmMessage')}</AText>
        <PrimaryButton label={t('common.cancel')} onPress={() => setShowSignOutConfirm(false)} />
        <Pressable onPress={() => void confirmSignOut()} accessibilityRole="button" style={{ alignSelf: 'center', padding: amazen.space(2) }}>
          <AText variant="body" tone="critical" style={{ fontSize: 15 }}>{t('profile.signOutButton')}</AText>
        </Pressable>
      </JobSheet>

      {/*
        ⚠️ Work that exists only on this phone is asked about first — signing
        out deletes the offline database, the queue with it. Keeping it is the
        primary; deleting it is the red text.
      */}
      <JobSheet
        visible={showUnsentConfirm}
        onClose={() => { setShowUnsentConfirm(false); void offline.running?.flush(); }}
        title={t('offline.signOut.title', { count: syncSnapshot.waiting + syncSnapshot.attention })}
      >
        <AText variant="body" tone="ink" style={{ fontSize: 14, lineHeight: 21 }}>{t('offline.signOut.body')}</AText>
        <PrimaryButton label={t('offline.signOut.send')} onPress={() => { setShowUnsentConfirm(false); void offline.running?.flush(); }} />
        <Pressable onPress={() => void confirmSignOut()} accessibilityRole="button" style={{ alignSelf: 'center', padding: amazen.space(2) }}>
          <AText variant="body" tone="critical" style={{ fontSize: 15 }}>{t('offline.signOut.discard')}</AText>
        </Pressable>
      </JobSheet>

      <GuideSheet visible={guidesOpen} onClose={() => setGuidesOpen(false)} />
    </Ground>
  );
}
