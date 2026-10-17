import { useState, useRef, useEffect } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useRouter, Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../src/contexts/auth-context';
import { useBiometricUnlock } from '../../src/hooks/use-biometric-unlock';
import { resolveCapability, getKeyOwner } from '../../src/lib/biometrics';
import { BiometricIcon } from '../../src/components/biometric-icon';
import { useTheme } from '../../src/contexts/theme-context';
import { ROUTES } from '../../src/lib/constants';
import { AText, PrimaryButton } from '../../src/components/amazen';
import { JobSheet, SheetOption } from '../../src/components/job/job-ui';
import { AuthCard, AuthField, AuthFrame, AuthHelp, AuthLinkLine } from '../../src/components/auth/auth-ui';
import { loadLastUser, shouldAutoPromptFor, type LastUser } from '../../src/lib/session/last-user';
import { useLoginScreen } from '../../src/screens/auth/use-login-screen';

export default function LoginScreen() {
  const {
    router,
    bio,
    offerBiometric,
    offerReplaces,
    t,
    email,
    setEmail,
    password,
    setPassword,
    isLoading,
    errors,
    setErrors,
    setUsePassword,
    amazen,
    c,
    unlockAndEnter,
    handleLogin,
    resolved,
    showBiometric,
    ownerName,
    bioNotice,
    switchToPassword,
    goHome,
  } = useLoginScreen();

  return (
    <AuthFrame
      footer={resolved && !showBiometric ? (
        <View style={{ gap: amazen.space(2.5) }}>
          <AuthLinkLine
            text={t('auth.login.noAccount')}
            link={t('auth.login.createOne')}
            onPress={() => router.push(ROUTES.register as Href)}
          />
          <AuthHelp />
        </View>
      ) : null}
    >
      {!resolved ? null : showBiometric ? (
        /* Face ID first when this phone holds a key — and WHOSE account it opens, or somebody signs in as a colleague. */
        <AuthCard>
          <View style={{ alignItems: 'center', gap: amazen.space(1) }}>
            <AText
              variant="h2"
              tone="strong"
              numberOfLines={1}
              style={{ fontSize: 21, fontFamily: amazen.font.sansLight }}
            >
              {t('biometrics.welcomeBack', { name: ownerName })}
            </AText>
            {bio.owner?.email ? <AText variant="caption" tone="onGlass" numberOfLines={1}>{bio.owner.email}</AText> : null}
          </View>
          <Pressable
            onPress={() => void unlockAndEnter()}
            disabled={bio.busy}
            accessibilityRole="button"
            accessibilityLabel={t('biometrics.unlockWith', { method: bio.label })}
            style={({ pressed }) => ({
              alignSelf: 'center',
              width: 104,
              height: 104,
              borderRadius: 32,
              backgroundColor: c.accentTint,
              borderWidth: 1.5,
              borderColor: c.accent,
              alignItems: 'center',
              justifyContent: 'center',
              marginVertical: amazen.space(2),
              opacity: pressed ? 0.85 : 1,
            })}
          >
            {bio.busy ? <ActivityIndicator color={c.accent} /> : <BiometricIcon method={bio.method} size={56} color={c.accent} />}
          </Pressable>
          <AText variant="body" tone="onGlass" style={{ textAlign: 'center', fontSize: 13.5 }}>
            {bio.failure === 'failed' ? t('biometrics.tapRetry') : t('biometrics.tapToUnlock', { method: bio.label })}
          </AText>
          <Pressable onPress={() => switchToPassword(true)} accessibilityRole="button"
            style={({ pressed }) => ({
              borderRadius: amazen.radius.full,
              backgroundColor: c.tile,
              paddingVertical: amazen.space(3),
              alignItems: 'center',
              opacity: pressed ? 0.8 : 1,
            })}>
            <AText variant="body" tone="strong" style={{ fontSize: 14.5 }}>{t('biometrics.usePassword')}</AText>
          </Pressable>
          <Pressable
            onPress={() => switchToPassword(false)}
            hitSlop={8}
            accessibilityRole="button"
            style={{ alignSelf: 'center', padding: amazen.space(1) }}>
            <AText variant="body" style={{ color: c.accent, fontSize: 13.5 }}>{t('biometrics.notYou', { name: ownerName })}</AText>
          </Pressable>
        </AuthCard>
      ) : (
        <AuthCard title={t('auth.login.title')} sub={t('auth.login.subtitle')}>
          {/* One tap back to Face ID, for the member who owns it. */}
          {bio.canUnlock ? (
            <Pressable onPress={() => setUsePassword(false)} accessibilityRole="button"
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: amazen.space(2.5),
                borderRadius: 14,
                backgroundColor: c.accentTint,
                padding: amazen.space(3),
                opacity: pressed ? 0.85 : 1,
              })}>
              <BiometricIcon method={bio.method} size={22} color={c.accent} />
              <AText variant="body" numberOfLines={1} style={{ flex: 1, color: c.accent, fontSize: 13.5 }}>
                {t('biometrics.backTo', { method: bio.label, name: ownerName })}
              </AText>
            </Pressable>
          ) : null}
          {/* Why Face ID went: said once, where the password goes. */}
          {bioNotice ? (
            <View style={{ borderRadius: 14, backgroundColor: c.warnTint, padding: amazen.space(3) }}>
              <AText variant="caption" tone="ink" style={{ lineHeight: 18 }}>{bioNotice}</AText>
            </View>
          ) : null}
          <AuthField
            label={t('auth.login.emailLabel')}
            placeholder={t('auth.login.emailPlaceholder')}
            keyboardType="email-address"
            autoCapitalize="none"
            textContentType="username"
            autoComplete="email"
            value={email}
            onChangeText={(v) => { setEmail(v); if (errors.email) setErrors({ ...errors, email: undefined }); }}
            error={errors.email}
          />
          <AuthField
            label={t('auth.login.passwordLabel')}
            placeholder={t('auth.login.passwordPlaceholder')}
            secure
            textContentType="password"
            autoComplete="password"
            value={password}
            onChangeText={(v) => { setPassword(v); if (errors.password) setErrors({ ...errors, password: undefined }); }}
            onSubmitEditing={() => void handleLogin()}
            returnKeyType="go"
            error={errors.password}
          />
          <Pressable
            onPress={() => router.push(ROUTES.forgotPassword as Href)}
            hitSlop={8}
            accessibilityRole="link"
            style={{ alignSelf: 'flex-end', marginTop: -amazen.space(1) }}>
            <AText variant="body" style={{ color: c.accent, fontSize: 13.5 }}>{t('auth.login.forgotPassword')}</AText>
          </Pressable>
          <PrimaryButton label={t('auth.login.submitButton')} loading={isLoading} onPress={() => void handleLogin()} />
        </AuthCard>
      )}

      {/* Offered once, here — the only moment with both a live session to bind and a reason to care. */}
      <JobSheet visible={offerBiometric} onClose={goHome} title={t('biometrics.enableTitle', { method: bio.label })}>
        <View
          style={{
            alignSelf: 'center',
            width: 64,
            height: 64,
            borderRadius: 20,
            backgroundColor: c.accentTint,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <BiometricIcon method={bio.method} size={32} color={c.accent} />
        </View>
        <AText variant="body" tone="ink" style={{ fontSize: 14, lineHeight: 21 }}>{t('biometrics.enableBody')}</AText>
        {offerReplaces ? (
          <View style={{ borderRadius: 14, backgroundColor: c.warnTint, padding: amazen.space(3) }}>
            <AText variant="caption" tone="ink" style={{ lineHeight: 18 }}>
              {t('biometrics.enableReplaces', { method: bio.label, name: offerReplaces })}
            </AText>
          </View>
        ) : null}
        <PrimaryButton
          label={t('biometrics.enable', { method: bio.label })}
          disabled={bio.busy}
          onPress={async () => {
            await bio.enroll();
            goHome();
          }}
        />
        <SheetOption label={t('biometrics.notNow')} onPress={goHome} />
      </JobSheet>
    </AuthFrame>
  );
}
