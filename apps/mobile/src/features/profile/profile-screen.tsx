import React, { useState, useCallback, useEffect, useRef } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, View } from 'react-native';
import { CachedImage } from '../../components/cached-image';
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
import {
  AText,
  GlassCard,
  Ground,
  HeaderBack,
  PrimaryButton,
  ScreenHeader,
  Well,
  WellDivider,
  SectionLabel,
  SheetOption,
} from '../../components/amazen';
import { centeredContent } from '../../components/screen-container';
import { JobSheet } from '../job/job-ui';
import { CameraGlyph, CloseGlyph, GalleryGlyph } from '../job/job-glyphs';
import { TourTarget, GuideSheet, useTourScroll } from '../tour';
import { PROFILE_GLYPHS } from './profile-glyphs';
import { useShift } from '../../offline/attendance/use-shift';
import { offersClockInPick, parseClockInPick } from '@hbcfield/shared/client';
import { hasUnsentLocalWork } from '../../lib/session/end-session';
import { useProfileScreen } from './use-profile-screen';
import { THEME_MODE_I18N, Group, Row } from './profile-screen-helpers';
import { useProfileScreenLogic } from './use-profile-screen-logic';
import { ProfileScreenProfilePhoto } from './profile-screen-profile-photo';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProfileScreen() {
  const vm = useProfileScreenLogic();
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
  } = vm;

  return (
    <Ground style={{ flex: 1 }}>
      {/* ⚠️ No avatar in the corner — you are on it. Back, because the tab bar is not drawn here. */}
      <ScreenHeader
        title={t('tabs.profile', 'Profile')}
        leading={<HeaderBack onPress={back} />}
        showAvatar={false}
        style={wide ?? undefined}
      />
      <ProfileScreenProfilePhoto vm={vm} />

      {/* The photo — a sheet in the design system, not a platform alert. */}
      <JobSheet visible={photoMenu} onClose={() => setPhotoMenu(false)} title={t('profile.profilePhoto')}>
        <SheetOption Glyph={CameraGlyph} label={t('profile.takePhoto')} onPress={() => void pickPhoto('camera')} />
        <SheetOption Glyph={GalleryGlyph} label={t('profile.chooseFromGallery')} onPress={() => void pickPhoto('gallery')} />
        {hasAvatar ? (
          <SheetOption
            Glyph={CloseGlyph}
            tone="critical"
            label={t('profile.removePhoto')}
            onPress={() => {
              setPhotoMenu(false);
              void handleRemoveAvatar();
            }}
          />
        ) : null}
      </JobSheet>

      <JobSheet visible={showSignOutConfirm} onClose={() => setShowSignOutConfirm(false)} title={t('profile.signOutConfirmTitle')}>
        <AText variant="body" tone="ink" style={{ fontSize: 14, lineHeight: 21 }}>{t('profile.signOutConfirmMessage')}</AText>
        <PrimaryButton label={t('common.cancel')} onPress={() => setShowSignOutConfirm(false)} />
        <Pressable
          onPress={() => void confirmSignOut()}
          accessibilityRole="button"
          style={{ alignSelf: 'center', padding: amazen.space(2) }}>
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
        <Pressable
          onPress={() => void confirmSignOut()}
          accessibilityRole="button"
          style={{ alignSelf: 'center', padding: amazen.space(2) }}>
          <AText variant="body" tone="critical" style={{ fontSize: 15 }}>{t('offline.signOut.discard')}</AText>
        </Pressable>
      </JobSheet>

      <GuideSheet visible={guidesOpen} onClose={() => setGuidesOpen(false)} />
    </Ground>
  );
}
