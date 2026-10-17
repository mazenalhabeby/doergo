import { useState } from 'react';
import { Linking, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../src/contexts/auth-context';
import { useTheme } from '../../src/contexts/theme-context';
import { authApi } from '../../src/lib/api';
import { AText, PrimaryButton } from '../../src/components/amazen';
import { AuthCard, AuthField, AuthFrame, AuthLinkLine } from '../../src/components/auth/auth-ui';

interface FormErrors {
  firstName?: string;
  lastName?: string;
  email?: string;
  password?: string;
}

export default function RegisterScreen() {
  const router = useRouter();
  const { login } = useAuth();
  const { t } = useTranslation();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  const { amazen } = useTheme();
  const c = amazen.color;

  // Animations

  const validate = (): boolean => {
    const newErrors: FormErrors = {};
    if (!firstName.trim()) newErrors.firstName = t('validation.firstNameRequired');
    if (!lastName.trim()) newErrors.lastName = t('validation.lastNameRequired');
    if (!email) {
      newErrors.email = t('validation.emailRequired');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = t('validation.emailInvalid');
    }
    if (!password) {
      newErrors.password = t('validation.passwordRequired');
    } else if (password.length < 8) {
      newErrors.password = t('validation.passwordMinLength');
    } else if (!/[A-Z]/.test(password)) {
      newErrors.password = t('validation.passwordUppercase');
    } else if (!/[a-z]/.test(password)) {
      newErrors.password = t('validation.passwordLowercase');
    } else if (!/[0-9]/.test(password)) {
      newErrors.password = t('validation.passwordNumber');
    }
    /* No "confirm password": Show lets them see what they typed, and the form is one field shorter. */
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleRegister = async () => {
    if (!validate()) return;
    setIsLoading(true);
    try {
      const trimmedEmail = email.toLowerCase().trim();
      // Register without company name → creates orphan user → navigation guard redirects to onboarding
      await authApi.register({
        email: trimmedEmail,
        password,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });
      // Auto-login → navigation guard handles routing to onboarding or app
      await login(trimmedEmail, password);
    } catch (error) {
      // Said under the email — the usual reason is an address already in use.
      const message = error instanceof Error ? error.message : t('auth.register.registrationFailed');
      setErrors({ email: message });
    } finally {
      setIsLoading(false);
    }
  };

  const clearError = (field: keyof FormErrors) => {
    if (errors[field]) setErrors({ ...errors, [field]: undefined });
  };

  const passwordChecks = [
    { label: t('auth.register.passwordChecks.minChars'), test: password.length >= 8 },
    { label: t('auth.register.passwordChecks.uppercase'), test: /[A-Z]/.test(password) },
    { label: t('auth.register.passwordChecks.lowercase'), test: /[a-z]/.test(password) },
    { label: t('auth.register.passwordChecks.number'), test: /[0-9]/.test(password) },
  ];

  const ready = !!firstName.trim() && !!lastName.trim() && !!email.trim() && passwordChecks.every((x) => x.test);

  return (
    <AuthFrame
      compact
      footer={
        <AuthLinkLine
          text={t('auth.register.hasAccount')}
          link={t('auth.register.signIn')}
          onPress={() => router.back()}
        />
      }>
      <AuthCard title={t('auth.register.title')} sub={t('auth.register.subtitle')}>
        <View style={{ flexDirection: 'row', gap: amazen.space(2) }}>
          <View style={{ flex: 1 }}>
            <AuthField label={t('auth.register.firstNameLabel')} placeholder={t('auth.register.firstNamePlaceholder')} autoCapitalize="words" textContentType="givenName"
              value={firstName} onChangeText={(v) => { setFirstName(v); clearError('firstName'); }} error={errors.firstName} />
          </View>
          <View style={{ flex: 1 }}>
            <AuthField label={t('auth.register.lastNameLabel')} placeholder={t('auth.register.lastNamePlaceholder')} autoCapitalize="words" textContentType="familyName"
              value={lastName} onChangeText={(v) => { setLastName(v); clearError('lastName'); }} error={errors.lastName} />
          </View>
        </View>
        <AuthField label={t('auth.register.emailLabel')} placeholder={t('auth.register.emailPlaceholder')} keyboardType="email-address" autoCapitalize="none"
          textContentType="emailAddress" autoComplete="email" value={email} onChangeText={(v) => { setEmail(v); clearError('email'); }} error={errors.email} />
        <AuthField label={t('auth.register.passwordLabel')} placeholder={t('auth.register.passwordPlaceholder')} secure textContentType="newPassword" autoComplete="new-password"
          value={password} onChangeText={(v) => { setPassword(v); clearError('password'); }} error={errors.password} />
        {/* The rules, turning green as they are met — the button wakes when all four are. */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: -amazen.space(1) }}>
          {passwordChecks.map((x) => (
            <View
              key={x.label}
              style={{
                borderRadius: amazen.radius.full,
                paddingHorizontal: 10,
                paddingVertical: 5,
                backgroundColor: x.test ? c.accentTint : c.tile,
              }}>
              <AText
                variant="caption"
                style={{ fontSize: 11.5, color: x.test ? c.accent : c.inkMuted }}
              >{`${x.test ? '✓ ' : ''}${x.label}`}</AText>
            </View>
          ))}
        </View>
        <PrimaryButton
          label={t('auth.register.submitButton')}
          loading={isLoading}
          disabled={!ready}
          onPress={() => void handleRegister()}
        />
        <AText variant="caption" tone="onGlass" style={{ textAlign: 'center', lineHeight: 17 }}>
          {t('auth.register.termsText')}
          <AText
            variant="caption"
            style={{ color: c.accent }}
            onPress={() => void Linking.openURL('https://hbcfield.com/terms').catch(() => undefined)}
          >
            {t('auth.register.termsOfService')}
          </AText>
          {t('auth.register.and')}
          <AText
            variant="caption"
            style={{ color: c.accent }}
            onPress={() => void Linking.openURL('https://hbcfield.com/privacy').catch(() => undefined)}
          >
            {t('auth.register.privacyPolicy')}
          </AText>
        </AText>
      </AuthCard>
    </AuthFrame>
  );
}
