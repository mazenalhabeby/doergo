import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, TextInput, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/auth-context';
import { useTheme } from '../../contexts/theme-context';
import { useVersionStatus } from '../../contexts/version-context';
import { useToast } from '../../island/island-context';
import { useBiometricUnlock } from '../../hooks/use-biometric-unlock';
import { openUpdate } from '../../lib/in-app-updates';
import { accountApi, passwordApi } from '../../lib/api';
import { AText, PrimaryButton, Well } from '../amazen';
import { BiometricIcon } from '../biometric-icon';
import { JobSheet, SectionLabel, SheetOption } from '../job/job-ui';
import { SettingsPage, SwitchRow } from './settings-ui';
import { personName } from '@hbcfield/shared/client';

const MIN_PASSWORD = 8;

/**
 * ACCOUNT & SECURITY — how you sign in first, then who you are, then leaving.
 *
 * ⚠️ Face ID / fingerprint is ALWAYS a row. It was hidden whenever the phone
 * answered "unavailable" — no sensor, a build without the module, or a check
 * that failed — so on a phone where it could not work the feature simply was
 * not there, and the reason went only to the developer log. The row now says
 * which, with the one action that fixes it where there is one.
 */
export function AccountPage() {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const bio = useBiometricUnlock();
  const { status: version } = useVersionStatus();
  const toast = useToast();
  const [deleting, setDeleting] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [busy, setBusy] = useState(false);

  const cap = bio.capability;
  /* Until the phone says which it has, name both — "Biometric unlock sign-in" names neither. */
  const bioTitle = cap?.kind === 'ready' && bio.method !== 'generic'
    ? t('biometrics.row', { method: bio.label })
    : t('settings.bio.eitherTitle', 'Face ID or fingerprint');

  let bioSub: string;
  let bioHelp: { text: string; action?: { label: string; onPress: () => void } } | null = null;
  if (!cap) bioSub = t('common.loading', 'Loading…');
  else if (cap.kind === 'ready') {
    bioSub = bio.enrolled ? t('biometrics.rowOnThis')
      : bio.owner ? t('biometrics.signsInAs', { name: bio.owner.name || bio.owner.email })
      : t('settings.bio.off', 'Off — you sign in with your password');
  } else if (cap.kind === 'none-enrolled') {
    bioSub = t('settings.bio.notSetUp', 'Not set up on this phone');
    bioHelp = { text: t('biometrics.notEnrolledBody'), action: { label: t('biometrics.openSettings'), onPress: bio.openSettings } };
  } else if (cap.kind === 'too-weak') {
    bioSub = t('settings.bio.tooWeak', 'This phone is not secure enough for it');
    bioHelp = { text: t('biometrics.weakBody'), action: { label: t('biometrics.openSettings'), onPress: bio.openSettings } };
  } else if (cap.reason === 'no-module') {
    bioSub = t('settings.bio.needsUpdate', 'Needs a newer version of the app');
    bioHelp = {
      text: t('settings.bio.needsUpdateBody', 'This version of HBCField cannot use it. The next one from the store can.'),
      action: version?.downloadUrl
        ? { label: t('settings.bio.update', 'Update'), onPress: () => void openUpdate(version.downloadUrl) }
        : undefined,
    };
  } else if (cap.reason === 'no-hardware') {
    bioSub = t('settings.bio.noSensor', 'This phone has neither');
  } else {
    bioSub = t('settings.bio.failed', 'Could not be checked on this phone');
  }

  const deleteAccount = async () => {
    if (!deletePassword.trim()) { toast.warning(t('common.required'), t('profile.account.deletePasswordRequired')); return; }
    setBusy(true);
    try {
      await accountApi.deleteAccount(deletePassword.trim());
      setDeleting(false);
      /*
        ⚠️ The account is gone, so everything of it on this phone goes too —
        the encrypted database and its queue included, unsent or not (there is
        nobody left to send it as, and erasure is the member's right). Also the
        one sign-out that forgets this phone's Face ID key.
      */
      await logout({ reason: 'account-deleted' });
    } catch (err) {
      toast.error(t('common.error'), err instanceof Error ? err.message : t('profile.account.deleteFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsPage title={t('settings.account.title', 'Account')}>
      <SectionLabel style={{ paddingHorizontal: amazen.space(1) }}>{t('settings.account.signingIn', 'Signing in')}</SectionLabel>
      <Well style={{ paddingHorizontal: amazen.space(3.5) }}>
        {cap?.kind === 'ready' ? (
          <SwitchRow
            first
            title={bioTitle}
            sub={bioSub}
            value={bio.enrolled}
            disabled={bio.busy}
            onChange={(on) => {
              void (on ? bio.enroll() : bio.disable());
            }}
          />
        ) : (
          <View style={{ flexDirection: 'row', gap: amazen.space(3), paddingVertical: amazen.space(3) }}>
            <BiometricIcon method={bio.method} size={22} color={c.inkMuted} />
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <AText variant="body" tone="strong" style={{ fontSize: 14.5 }}>{bioTitle}</AText>
              <AText variant="caption" tone="muted">{bioSub}</AText>
              {bioHelp ? <AText variant="caption" tone="ink" style={{ marginTop: 6, lineHeight: 18 }}>{bioHelp.text}</AText> : null}
              {bioHelp?.action ? (
                <Pressable
                  onPress={bioHelp.action.onPress}
                  accessibilityRole="button"
                  style={{
                    alignSelf: 'flex-start',
                    marginTop: 8,
                    borderRadius: amazen.radius.full,
                    backgroundColor: c.tile,
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                  }}>
                  <AText variant="caption" style={{ color: c.accent, fontSize: 13 }}>{bioHelp.action.label}</AText>
                </Pressable>
              ) : null}
            </View>
          </View>
        )}
        <Pressable onPress={() => router.push('/(app)/profile/password' as Href)} accessibilityRole="button"
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: amazen.space(3),
            paddingVertical: amazen.space(3),
            borderTopWidth: 1,
            borderTopColor: c.lineWell,
            opacity: pressed ? 0.75 : 1,
          })}>
          <View style={{ flex: 1, gap: 2 }}>
            <AText variant="body" tone="strong" style={{ fontSize: 14.5 }}>{t('profile.account.changePassword', 'Change password')}</AText>
            <AText variant="caption" tone="muted">
              {t('settings.account.passwordRule', {
                count: MIN_PASSWORD,
                defaultValue: 'At least {{count}} characters',
              })}
            </AText>
          </View>
          <AText variant="body" tone="muted">›</AText>
        </Pressable>
      </Well>

      <SectionLabel style={{ paddingHorizontal: amazen.space(1), paddingTop: amazen.space(2) }}>
        {t('settings.account.you', 'You')}
      </SectionLabel>
      <Well style={{ paddingHorizontal: amazen.space(3.5) }}>
        {[[t('profile.account.nameLabel'), personName(user)], [t('profile.account.emailLabel'), user?.email ?? '']].map(([k, v], i) => (
          <View key={k} style={{ paddingVertical: amazen.space(3), borderTopWidth: i === 0 ? 0 : 1, borderTopColor: c.lineWell, gap: 2 }}>
            <AText variant="caption" tone="muted">{k}</AText>
            <AText variant="body" tone="strong" selectable style={{ fontSize: 14.5 }}>{v}</AText>
          </View>
        ))}
      </Well>

      <SectionLabel style={{ paddingHorizontal: amazen.space(1), paddingTop: amazen.space(2) }}>
        {t('settings.account.leaving', 'Leaving')}
      </SectionLabel>
      <Well style={{ paddingHorizontal: amazen.space(3.5) }}>
        <Pressable
          onPress={() => setDeleting(true)}
          accessibilityRole="button"
          style={({ pressed }) => ({ paddingVertical: amazen.space(3), gap: 2, opacity: pressed ? 0.75 : 1 })}>
          <AText variant="body" style={{ fontSize: 14.5, color: c.critical }}>{t('settings.account.delete', 'Delete my account')}</AText>
          <AText variant="caption" tone="muted">{t('settings.account.deleteSub', 'Asks for your password first')}</AText>
        </Pressable>
      </Well>

      <JobSheet
        visible={deleting}
        onClose={() => {
          setDeleting(false);
          setDeletePassword('');
        }}
        busy={busy}
        title={t('profile.account.deleteConfirmTitle', 'Delete your account?')}>
        <AText variant="body" tone="ink" style={{ fontSize: 14, lineHeight: 21 }}>
          {t('settings.account.deleteBody', ('Your sign-in, your photo and your settings are deleted, and you are ' + 'signed out on every phone. The work you did stays with your ' + 'organization: jobs, hours, documents.'))}
        </AText>
        <PasswordField
          value={deletePassword}
          onChange={setDeletePassword}
          placeholder={t('settings.account.yourPassword', 'Your password')}
        />
        <PrimaryButton
          label={t('settings.account.keep', 'Keep my account')}
          onPress={() => {
            setDeleting(false);
            setDeletePassword('');
          }}
        />
        <SheetOption
          label={t('settings.account.deleteIt', 'Delete it')}
          tone="critical"
          disabled={busy}
          onPress={() => void deleteAccount()}
        />
      </JobSheet>
    </SettingsPage>
  );
}

/** A password box with Show/Hide, in the app's field. */
function PasswordField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t } = useTranslation();
  const [shown, setShown] = useState(false);
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: c.sunken,
        borderRadius: 16,
        borderWidth: 1.5,
        borderColor: c.lineWell,
        paddingHorizontal: amazen.space(3.5),
      }}>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={c.inkMuted}
        secureTextEntry={!shown}
        autoCapitalize="none"
        autoCorrect={false}
        style={{ flex: 1, color: c.inkStrong, fontFamily: amazen.font.sans, fontSize: 14, paddingVertical: amazen.space(3) }}
        accessibilityLabel={placeholder}
      />
      <Pressable onPress={() => setShown((s) => !s)} hitSlop={10} accessibilityRole="button">
        <AText variant="caption" style={{ color: c.accent }}>
          {shown ? t('settings.account.hide', 'Hide') : t('settings.account.show', 'Show')}
        </AText>
      </Pressable>
    </View>
  );
}

/** CHANGE PASSWORD — its own page, not three fields always open in the middle of the account. */
export function PasswordPage() {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!current.trim()) { toast.warning(t('common.required'), t('profile.account.currentPasswordRequired')); return; }
    if (next.length < MIN_PASSWORD) { toast.warning(t('common.error'), t('profile.account.newPasswordTooShort')); return; }
    if (next !== again) { toast.warning(t('common.error'), t('profile.account.passwordsMismatch')); return; }
    setBusy(true);
    try {
      await passwordApi.changePassword({ currentPassword: current.trim(), newPassword: next.trim() });
      toast.success(t('common.success'), t('profile.account.passwordChanged'));
      router.back();
    } catch (err) {
      toast.error(t('common.error'), err instanceof Error ? err.message : t('profile.account.failedToChange'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SettingsPage title={t('profile.account.changePassword', 'Change password')}>
        <PasswordField value={current} onChange={setCurrent} placeholder={t('profile.account.currentPasswordLabel', 'Current password')} />
        <PasswordField value={next} onChange={setNext} placeholder={t('profile.account.newPasswordLabel', 'New password')} />
        <PasswordField value={again} onChange={setAgain} placeholder={t('settings.account.again', 'New password again')} />
        <AText variant="caption" tone="onGlass" style={{ paddingHorizontal: amazen.space(1) }}>
          {t('settings.account.passwordNote', {
            count: MIN_PASSWORD,
            defaultValue: 'At least {{count}} characters. You stay signed in on this phone.',
          })}
        </AText>
        <PrimaryButton
          label={t('profile.account.changePassword', 'Change password')}
          loading={busy}
          disabled={!current || !next || !again}
          onPress={() => void save()}
        />
      </SettingsPage>
    </KeyboardAvoidingView>
  );
}
