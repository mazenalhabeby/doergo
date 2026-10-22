import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/theme-context';
import { passwordApi } from '@/lib/api/auth';
import { AText, PrimaryButton } from '@/components/amazen';
import { FinishGlyph } from '@/components/glyphs/work-glyphs';
import { AuthCard, AuthField, AuthFrame, AuthHelp, AuthLinkLine } from '@/features/auth/auth-ui';

/**
 * Forgot password — one field, one button; then what happens next.
 *
 * ⚠️ "Sent" whatever the server answers: saying "no such account" would tell
 * anybody which addresses have one.
 */
export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { amazen } = useTheme();
  const c = amazen.color;

  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [error, setError] = useState<string | undefined>();


  const validate = () => {
    if (!email) {
      setError(t('validation.emailRequired'));
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError(t('validation.emailInvalid'));
      return false;
    }
    setError(undefined);
    return true;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    setIsLoading(true);
    try {
      await passwordApi.forgotPassword(email.toLowerCase().trim());
      setIsSent(true);
    } catch {
      // Always show success to prevent email enumeration
      setIsSent(true);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthFrame
      footer={
        <View style={{ gap: amazen.space(2.5) }}>
          <AuthLinkLine
            text={t('auth.forgotPassword.rememberPassword')}
            link={t('auth.forgotPassword.signIn')}
            onPress={() => router.back()}
          />
          <AuthHelp />
        </View>
      }
    >
      {isSent ? (
        <AuthCard>
          <View style={{ alignItems: 'center', gap: amazen.space(2) }}>
            <FinishGlyph size={56} color={c.accent} contrast={c.accentInk} />
            <AText
              variant="h2"
              tone="strong"
              style={{ fontSize: 21, fontFamily: amazen.font.sansLight, textAlign: 'center' }}
            >
              {t('auth.forgotPassword.sentTitle')}
            </AText>
            <AText variant="body" tone="onGlass" style={{ fontSize: 13.5, lineHeight: 20, textAlign: 'center' }}>
              {t('auth.forgotPassword.sentMessage', { email })}
            </AText>
          </View>
          <PrimaryButton label={t('auth.forgotPassword.backToLogin')} onPress={() => router.back()} />
        </AuthCard>
      ) : (
        <AuthCard title={t('auth.forgotPassword.title')} sub={t('auth.forgotPassword.subtitle')}>
          <AuthField
            label={t('auth.forgotPassword.emailLabel')}
            placeholder={t('auth.forgotPassword.emailPlaceholder')}
            keyboardType="email-address"
            autoCapitalize="none"
            textContentType="emailAddress"
            value={email}
            onChangeText={(v) => { setEmail(v); if (error) setError(undefined); }}
            onSubmitEditing={() => void handleSubmit()}
            returnKeyType="send"
            error={error}
          />
          <PrimaryButton label={t('auth.forgotPassword.submitButton')} loading={isLoading} onPress={() => void handleSubmit()} />
        </AuthCard>
      )}
    </AuthFrame>
  );
}
