import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { router, type Href, useFocusEffect } from 'expo-router';
import Constants from 'expo-constants';
import { orgHasAddOn, Role } from '@hbcfield/shared/client';
import { uuidv7 } from '../../offline/ids';
import type { AvatarChange } from '../../offline/profile/pending-avatar';
import { updateOwnProfile } from '../../offline/profile/profile-actions';
import { useOffline, useSyncStatus } from '../../offline/offline-context';
import { useVersionStatus } from '../../contexts/version-context';
import { useAuth } from '../../contexts/auth-context';
import { getCurrentLanguage, supportedLanguages } from '../../i18n';
import { useTheme } from '../../contexts/theme-context';
import { useHeldAssets } from '../../hooks/use-held-assets';
import { useDocumentRequirements } from '../../contexts/document-requirements-context';
import { useToast } from '../../island/island-context';
import { useImagePicker } from '../../hooks/useImagePicker';
import { avatarApi, userApi, resolveMediaUrl } from '../../lib/api';
import { useResponsive } from '../../lib/responsive';
import { centeredContent } from '../screen-container';
import { useTourScroll } from '../tour';
import { useShift } from '../../offline/attendance/use-shift';
import { offersClockInPick } from '@hbcfield/shared/client';
import { hasUnsentLocalWork } from '../../lib/session/end-session';

/** ProfileScreen's state and handlers — everything before its markup, moved here unchanged. */
export function useProfileScreen() {
  const { user, logout, refreshUser, patchUser } = useAuth();
  const offline = useOffline();
  // "Clock in" means something only with more than one workspace to clock in at.
  const clockInOffered = offersClockInPick(useShift().status?.assignedLocations?.length ?? 0);
  const { snapshot: syncSnapshot } = useSyncStatus();
  const [showUnsentConfirm, setShowUnsentConfirm] = useState(false);
  const { amazen, mode } = useTheme();
  const c = amazen.color;
  const toast = useToast();
  const { t } = useTranslation();
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
  const tourScroll = useTourScroll();

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
    // The old work-log queue counts too — the same rule the session end uses.
    if (offline.running?.hasUnsent()) {
      setShowUnsentConfirm(true);
      return;
    }
    void (user?.id ? hasUnsentLocalWork(user.id) : Promise.resolve(false)).then((unsent) =>
      unsent ? setShowUnsentConfirm(true) : setShowSignOutConfirm(true),
    );
  };

  const confirmSignOut = async () => {
    setShowSignOutConfirm(false);
    setShowUnsentConfirm(false);
    // Nothing unsent, or the member chose to delete it: the phone's copy goes too.
    // Everything else a sign-out clears is `endSession`'s, the same for every exit.
    await logout({ keepUnsent: false });
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

  return {
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
  };
}
