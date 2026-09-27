import React, { useState, useCallback, useEffect, useRef } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { router, type Href, useFocusEffect } from 'expo-router';
import Constants from 'expo-constants';
import { orgHasAddOn, Role } from '@hbcfield/shared/client';
import { uuidv7 } from '../../offline/ids';
import type { AvatarChange } from '../../offline/profile/pending-avatar';
import { updateOwnProfile } from '../../offline/profile/profile-actions';
import { useOffline, useSyncStatus } from '../../offline/offline-context';
import { destroyOfflineDatabase } from '../../offline/db/database';
import { DeviceFileDisk } from '../../offline/files/device-file-disk';
import { MediaCache } from '../../offline/files/media-cache';
import { unregisterBackgroundSync } from '../../offline/background-sync';
import { useVersionStatus } from '../../contexts/version-context';
import { openUpdate } from '../../lib/in-app-updates';
import { useAuth } from '../../contexts/auth-context';
import { getCurrentLanguage, supportedLanguages } from '../../i18n';
import { useTheme, type ThemeMode } from '../../contexts/theme-context';
import { useHeldAssets } from '../../hooks/use-held-assets';
import { useDocumentRequirements } from '../../contexts/document-requirements-context';
import { useToast } from '../../island/island-context';
import { usePushNotifications } from '../../hooks/usePushNotifications';
import { useImagePicker } from '../../hooks/useImagePicker';
import { avatarApi, userApi, resolveMediaUrl } from '../../lib/api';
import { useResponsive } from '../../lib/responsive';
import { AText, GlassCard, Ground, HeaderBack, PrimaryButton, ScreenHeader, Well, WellDivider } from '../amazen';
import { ConfirmSheet } from '../confirm-sheet';
import { centeredContent } from '../screen-container';
import { JobSheet, SectionLabel, SheetOption } from '../job/job-ui';
import { CameraGlyph, CloseGlyph, GalleryGlyph } from '../job/job-glyphs';
import { TourTarget, GuideSheet } from '../tour';
import { PROFILE_GLYPHS } from './profile-glyphs';

function getInitials(firstName?: string, lastName?: string): string {
  const f = (firstName || '').charAt(0).toUpperCase();
  const l = (lastName || '').charAt(0).toUpperCase();
  return f + l || '?';
}

const THEME_MODE_I18N: Record<ThemeMode, string> = {
  system: 'profile.theme.system',
  light: 'profile.theme.light',
  dark: 'profile.theme.dark',
};


// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProfileScreen() {
  const { user, logout, refreshUser, patchUser } = useAuth();
  const offline = useOffline();
  const { snapshot: syncSnapshot } = useSyncStatus();
  const [showUnsentConfirm, setShowUnsentConfirm] = useState(false);
  const { amazen, mode } = useTheme();
  const c = amazen.color;
  const toast = useToast();
  const { t } = useTranslation();
  const { unregisterPushToken } = usePushNotifications();
  const { pickFromGallery, takePhoto } = useImagePicker();
  // Already loaded for the home card — this reads the same fetch, not a second one.
  const { total: outstandingDocs, blocksWork: docsBlockWork } = useDocumentRequirements();
  /*
    Whether "What I have" appears at all.

    Decided by whether this member actually holds anything, not by a permission
    and not by a module flag: most members hold nothing, and a permanent row
    that opens an empty screen is how a menu teaches people to stop reading it.
  */
  const { held, canPropose } = useHeldAssets();
  /* Without the Documents option, My equipment is where a contract is sent in — so it must be reachable with nothing held. */
  const contractHere = canPropose && !orgHasAddOn(user?.orgAddOns ?? null, 'documents');

  const [avatarLoading, setAvatarLoading] = useState(false);
  const [savingPresence, setSavingPresence] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [guidesOpen, setGuidesOpen] = useState(false);

  // Availability control (mirrors the web navbar toggle): Available / Busy / Away.
  const handleSetPresence = useCallback(async (presence: 'AVAILABLE' | 'BUSY' | 'AWAY') => {
    setSavingPresence(true);
    try {
      if (offline.engine && user?.id) {
        const outcome = await updateOwnProfile(offline.engine, user.id, { presence });
        if (outcome.kind === 'refused') throw new Error(outcome.message);
        patchUser({ presence });
        if (outcome.kind === 'queued') toast.info(t('offline.savedForLater'));
        return;
      }
      await userApi.setPresence(presence);
      await refreshUser();
    } catch (err) {
      toast.error(t('common.error'), err instanceof Error ? err.message : t('profile.status.failed', 'Could not update status'));
    } finally {
      setSavingPresence(false);
    }
  }, [refreshUser, toast, t, offline.engine, user?.id, patchUser]);
  const hasRefreshed = useRef(false);
  const lastFetchTimeRef = useRef(0);

  // Refresh user data when profile screen is focused (picks up admin edits)
  useFocusEffect(
    useCallback(() => {
      if (hasRefreshed.current) {
        if (Date.now() - lastFetchTimeRef.current < 30000) return;
        lastFetchTimeRef.current = Date.now();
        refreshUser();
      }
      hasRefreshed.current = true;
    }, [refreshUser])
  );

  const isTechnician = user?.role === Role.EMPLOYEE;
  const appVersion = Constants.expoConfig?.version || '1.0.0';
  const { status: versionStatus } = useVersionStatus();
  /*
    A photo chosen (or removed) without signal shows at once and is sent when
    a connection returns — see offline/profile/pending-avatar.ts.
  */
  const [pendingAvatar, setPendingAvatar] = useState<AvatarChange | null>(null);
  useEffect(() => {
    const queue = offline.avatar;
    if (!queue) {
      setPendingAvatar(null);
      return;
    }
    void queue.current().then(setPendingAvatar);
    return queue.subscribe((change) => {
      setPendingAvatar(change);
      if (!change) void refreshUser();
    });
  }, [offline.avatar, refreshUser]);
  const shownAvatarUri = pendingAvatar?.kind === 'photo' ? pendingAvatar.uri
    : pendingAvatar?.kind === 'remove' ? null
    : user?.avatarUrl ? resolveMediaUrl(user.avatarUrl) : null;
  const hasAvatar = !!shownAvatarUri;

  // ---- avatar upload flow ------------------------------------------------

  const uploadAvatar = useCallback(async (uri: string, fileName: string, mimeType: string) => {
    setAvatarLoading(true);
    try {
      if (offline.avatar && offline.files) {
        // Kept on the phone first, so it survives no signal and a closed app.
        const fileId = uuidv7();
        const kept = await offline.files.keep({ id: fileId, kind: 'photo', mime: mimeType, uri });
        await offline.avatar.set({ kind: 'photo', fileId, uri: kept.path, mime: kept.mime, fileName, at: Date.now() });
        const result = await offline.avatar.flush();
        if (result === 'waiting') toast.info(t('offline.savedForLater'));
        if (result === 'refused') toast.error(t('profile.uploadFailed'), t('profile.couldNotUpload'));
        return;
      }
      // Upload the avatar (multipart) — returns the new avatar URL
      await avatarApi.upload(uri, fileName, mimeType);

      // Refresh user data
      await refreshUser();
    } catch (err: any) {
      toast.error(t('profile.uploadFailed'), err?.message || t('profile.couldNotUpload'));
    } finally {
      setAvatarLoading(false);
    }
  }, [refreshUser, offline.avatar, offline.files]);

  const handleRemoveAvatar = useCallback(async () => {
    setAvatarLoading(true);
    try {
      if (offline.avatar) {
        await offline.avatar.set({ kind: 'remove', at: Date.now() });
        const result = await offline.avatar.flush();
        if (result === 'waiting') toast.info(t('offline.savedForLater'));
        return;
      }
      await avatarApi.remove();
      await refreshUser();
    } catch (err: any) {
      toast.error(t('common.error'), err?.message || t('profile.couldNotRemove'));
    } finally {
      setAvatarLoading(false);
    }
  }, [refreshUser, offline.avatar]);

  // The photo menu is a sheet in the design system, not a platform alert.
  const [photoMenu, setPhotoMenu] = useState(false);
  const handleAvatarPress = useCallback(() => {
    if (!avatarLoading) setPhotoMenu(true);
  }, [avatarLoading]);
  const pickPhoto = useCallback(async (from: 'camera' | 'gallery') => {
    setPhotoMenu(false);
    if (from === 'camera') {
      const photo = await takePhoto('avatar');
      if (photo) void uploadAvatar(photo.uri, photo.fileName, photo.mimeType);
    } else {
      const images = await pickFromGallery('avatar');
      const img = images[0];
      if (img) void uploadAvatar(img.uri, img.fileName, img.mimeType);
    }
  }, [takePhoto, pickFromGallery, uploadAvatar]);

  // ---- handlers -----------------------------------------------------------

  const handleAppearancePress = useCallback(() => {
    router.push('/profile/appearance' as Href);
  }, []);

  const handleTimeFormatPress = useCallback(() => {
    router.push('/profile/time-format' as Href);
  }, []);

  const handleLogout = () => {
    /*
      ⚠️ Work that exists only on this phone is asked about first.

      Signing out deletes the member's offline database — the queue with it. A
      plain "Sign out?" would let somebody throw away a morning of clock-ins and
      photos with one tap, so unsent work gets its own question.
    */
    // `running`, not `engine`: with offline mode off a phone may still hold queued work.
    if (offline.running?.hasUnsent()) setShowUnsentConfirm(true);
    else setShowSignOutConfirm(true);
  };

  const confirmSignOut = async () => {
    setShowSignOutConfirm(false);
    setShowUnsentConfirm(false);
    const userId = user?.id;
    await unregisterPushToken();
    await logout();
    // Nothing unsent (or the member chose to delete it): the copy goes too.
    if (userId) {
      await unregisterBackgroundSync();
      await destroyOfflineDatabase(userId).catch(() => undefined);
      DeviceFileDisk.forMember(userId).destroyAll();
      MediaCache.destroyForMember(userId);
    }
  };
  /* ---------------- the page ---------------- */

  const r = useResponsive();
  const wide = r.isTablet ? centeredContent(640) : null;
  const back = () => (router.canGoBack() ? router.back() : router.navigate('/(app)/(tabs)' as Href));
  const presence = user?.presence ?? 'AVAILABLE';
  const lang = supportedLanguages.find((l) => l.code === getCurrentLanguage());
  const waitingOnPhone = syncSnapshot.attention + syncSnapshot.waiting;
  const badges = user?.profileBadges;
  const showSpecialty = badges?.showSpecialty !== false;
  const roleLine = [user?.position, isTechnician && showSpecialty ? user?.specialty : null].filter(Boolean).join(' · ');

  return (
    <Ground style={{ flex: 1 }}>
      {/* ⚠️ No avatar in the corner — you are on it. Back, because the tab bar is not drawn here. */}
      <ScreenHeader title={t('tabs.profile', 'Profile')} leading={<HeaderBack onPress={back} />} showAvatar={false} style={wide ?? undefined} />
      <ScrollView
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
                  <Image source={{ uri: shownAvatarUri }} style={{ width: 96, height: 96 }} />
                ) : (
                  <AText variant="h2" tone="accent" style={{ fontSize: 32, lineHeight: 40 }}>{getInitials(user?.firstName, user?.lastName)}</AText>
                )}
              </View>
              <View style={{ position: 'absolute', right: -2, bottom: -2, width: 32, height: 32, borderRadius: 16, backgroundColor: c.accentSolid, borderWidth: 3, borderColor: c.well, alignItems: 'center', justifyContent: 'center' }}>
                <CameraGlyph size={14} color={c.accentInk} />
              </View>
            </Pressable>
            <View style={{ alignItems: 'center', gap: 2 }}>
              <AText variant="h2" tone="strong" numberOfLines={1} style={{ fontSize: 22, lineHeight: 28 }}>{`${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim()}</AText>
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
        <Group label={t('profile.group.settings', 'Settings')}>
          <Row glyph="notifications" label={t('profile.menu.notifications')} onPress={() => router.push('/profile/notifications' as Href)} />
          <Row glyph="appearance" label={t('profile.menu.appearance')} value={t(THEME_MODE_I18N[mode])} onPress={handleAppearancePress} />
          <Row glyph="timeFormat" label={t('profile.menu.timeFormat')} value={t(`profile.timeFormat.${user?.timeFormat === '12h' ? '12h' : '24h'}`)} onPress={handleTimeFormatPress} />
          <Row glyph="language" label={t('profile.menu.language')} value={lang?.label} onPress={() => router.push('/profile/language' as Href)} />
          <Row glyph="account" label={t('profile.menu.accountSecurity')} onPress={() => router.push('/profile/account' as Href)} />
        </Group>

        <Group label={t('profile.menu.support')}>
          <Row glyph="help" label={t('profile.menu.helpCenter')} onPress={() => Linking.openURL('https://hbcfield.com/help').catch(() => {})} />
          <Row glyph="support" label={t('profile.menu.contactSupport')} onPress={() => router.push('/support' as Href)} />
          <TourTarget name="profile-guide">
            <Row glyph="tour" label={t('profile.menu.guidedTour')} onPress={() => setGuidesOpen(true)} />
          </TourTarget>
          <Row glyph="rate" label={t('profile.menu.rateApp')} onPress={() => Linking.openURL('https://apps.apple.com').catch(() => {})} />
        </Group>

        <Group label={t('profile.menu.legal')}>
          <Row glyph="terms" label={t('profile.menu.termsOfService')} onPress={() => Linking.openURL('https://hbcfield.com/terms').catch(() => {})} />
          <Row glyph="privacy" label={t('profile.menu.privacyPolicy')} onPress={() => Linking.openURL('https://hbcfield.com/privacy').catch(() => {})} />
          <Row glyph="about" label={t('profile.menu.about')} value={`v${appVersion}`} valueTone={versionStatus?.updateAvailable ? 'accent' : undefined} onPress={() => router.push('/profile/about' as Href)} />
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

/** A labelled group of rows on a well. Children that render nothing leave no divider behind. */
function Group({ label, children }: { label: string; children: React.ReactNode }) {
  const { amazen } = useTheme();
  const rows = React.Children.toArray(children).filter(Boolean);
  if (!rows.length) return null;
  return (
    <View style={{ gap: amazen.space(2) }}>
      <SectionLabel style={{ paddingHorizontal: amazen.space(1), paddingTop: amazen.space(1) }}>{label}</SectionLabel>
      <Well style={{ paddingHorizontal: amazen.space(3.5) }}>
        {rows.map((row, i) => (
          <React.Fragment key={i}>
            {i > 0 ? <WellDivider /> : null}
            {row}
          </React.Fragment>
        ))}
      </Well>
    </View>
  );
}

function Row({
  glyph, label, value, valueTone, count = 0, countTone = 'warn', onPress,
}: {
  glyph: keyof typeof PROFILE_GLYPHS;
  label: string;
  value?: string;
  valueTone?: 'accent';
  count?: number;
  countTone?: 'warn' | 'critical';
  onPress: () => void;
}) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const G = PROFILE_GLYPHS[glyph];
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={value ? `${label}, ${value}` : label}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: amazen.space(3), paddingVertical: amazen.space(3), opacity: pressed ? 0.8 : 1 })}>
      <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: c.accentTint, alignItems: 'center', justifyContent: 'center' }}>
        <G size={19} color={c.accent} contrast={c.well} />
      </View>
      <AText variant="body" tone="strong" numberOfLines={1} style={{ flex: 1, fontSize: 14.5 }}>{label}</AText>
      {value ? <AText variant="caption" numberOfLines={1} style={{ fontSize: 13, color: valueTone === 'accent' ? c.accent : c.inkMuted, maxWidth: '40%' }}>{value}</AText> : null}
      {count > 0 ? (
        <View style={{ minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: countTone === 'critical' ? c.criticalTint : c.warnTint, alignItems: 'center', justifyContent: 'center' }}>
          <AText variant="caption" tone={countTone} numeric>{String(count)}</AText>
        </View>
      ) : null}
      <AText variant="body" tone="muted">›</AText>
    </Pressable>
  );
}
