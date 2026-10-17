'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { notify } from '@/lib/toast';
import { Eye, EyeOff, Mail, Lock, User, Check } from 'lucide-react';
import { Button, Input, Label, Checkbox, Spinner } from '@/components/ui';
import { useAuth } from '@/contexts/auth-context';
import { authApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { registerSchema, passwordRequirements, type RegisterFormData } from '@/lib/validation';
import {
  type RegisterFormProps,
  type ValidationErrors,
  type InputClassFn,
  NameFields,
  EmailField,
  PasswordField,
} from './register-password-field';
import { ConfirmPasswordField } from './confirm-password-field';

export function RegisterForm({ isActive, isMobile = false }: RegisterFormProps) {
  const router = useRouter();
  const { login } = useAuth();
  const { t } = useTranslation();

  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const [formData, setFormData] = useState<RegisterFormData>({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    acceptTerms: false,
  });

  const updateField = <K extends keyof RegisterFormData>(field: K, value: RegisterFormData[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (validationErrors[field]) {
      setValidationErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setValidationErrors({});

    const result = registerSchema.safeParse(formData);
    if (!result.success) {
      const fieldErrors: ValidationErrors = {};
      result.error.errors.forEach((err) => {
        const field = err.path[0] as keyof RegisterFormData;
        if (!fieldErrors[field]) {
          fieldErrors[field] = err.message;
        }
      });
      setValidationErrors(fieldErrors);
      notify.error(result.error.errors[0]?.message || t('auth.register.validationErrorDescription'));
      setIsLoading(false);
      return;
    }

    try {
      // Register as an "orphan" user (no company) — account creation is decoupled
      // from organization membership. Onboarding decides create-org / join / invite.
      await authApi.register({
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        password: formData.password,
      });

      await login(formData.email, formData.password);
      notify.success(t('auth.register.successTitle'), t('auth.register.successDescription'));
      // Every new user starts in onboarding; the wizard routes them onward.
      router.push('/onboarding');
    } catch (err) {
      notify.error(err instanceof Error ? err.message : t('auth.register.errorDescription'));
    } finally {
      setIsLoading(false);
    }
  };

  const getTransitionDelay = (baseDelay: number) => {
    return isMobile ? '0s' : `${baseDelay}s`;
  };

  const inputClass = (field: string, hasError: boolean) =>
    cn(
      'h-9 sm:h-10 text-sm transition-all duration-200',
      hasError && 'border-error',
      focusedField === field && 'border-blue-600 ring-2 ring-blue-100',
      focusedField === field && !isMobile && 'scale-[1.02]'
    );

  return (
    <div className={cn('flex flex-col justify-center', !isMobile && 'h-full')}>
      {/* Header - hidden on mobile */}
      {!isMobile && (
        <div
          className={cn(
            'space-y-1 lg:space-y-2 mb-3 lg:mb-4 transition-all duration-500',
            isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          )}
        >
          <h1 className="text-xl lg:text-2xl font-semibold tracking-tight text-slate-900">
            {t('auth.register.title')}
          </h1>
          <p className="text-xs lg:text-sm text-slate-500">{t('auth.register.subtitle')}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-2.5 sm:space-y-3">
        {/* Name Fields */}
        <NameFields
          firstName={formData.firstName}
          lastName={formData.lastName}
          onFirstNameChange={(v) => updateField('firstName', v)}
          onLastNameChange={(v) => updateField('lastName', v)}
          errors={validationErrors}
          isLoading={isLoading}
          isActive={isActive}
          focusedField={focusedField}
          onFocusChange={setFocusedField}
          inputClass={inputClass}
          transitionDelay={getTransitionDelay(0.05)}
        />

        {/* Email */}
        <EmailField
          value={formData.email}
          onChange={(v) => updateField('email', v)}
          error={validationErrors.email}
          isLoading={isLoading}
          isActive={isActive}
          focusedField={focusedField}
          onFocusChange={setFocusedField}
          inputClass={inputClass}
          transitionDelay={getTransitionDelay(0.15)}
        />

        {/* Password */}
        <PasswordField
          value={formData.password}
          onChange={(v) => updateField('password', v)}
          error={validationErrors.password}
          isLoading={isLoading}
          isActive={isActive}
          showPassword={showPassword}
          onTogglePassword={() => setShowPassword(!showPassword)}
          focusedField={focusedField}
          onFocusChange={setFocusedField}
          inputClass={inputClass}
          transitionDelay={getTransitionDelay(0.2)}
        />

        {/* Confirm Password */}
        <ConfirmPasswordField
          value={formData.confirmPassword}
          onChange={(v) => updateField('confirmPassword', v)}
          error={validationErrors.confirmPassword}
          isLoading={isLoading}
          isActive={isActive}
          focusedField={focusedField}
          onFocusChange={setFocusedField}
          inputClass={inputClass}
          transitionDelay={getTransitionDelay(0.25)}
        />

        {/* Terms */}
        <div
          className={cn(
            'flex items-start gap-2 transition-all duration-500',
            isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          )}
          style={{ transitionDelay: getTransitionDelay(0.3) }}
        >
          <Checkbox
            id="reg-terms"
            checked={formData.acceptTerms}
            onCheckedChange={(checked) => updateField('acceptTerms', checked as boolean)}
            className="mt-0.5 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
          />
          <Label
            htmlFor="reg-terms"
            className="text-[10px] sm:text-[11px] text-slate-600 cursor-pointer leading-tight hover:text-slate-900 transition-colors"
          >
            {t('auth.register.termsPrefix')}{' '}
            <Link href="/terms" className="text-blue-600 hover:text-blue-700 hover:underline">
              {t('auth.register.termsOfService')}
            </Link>{' '}
            {t('auth.register.termsAnd')}{' '}
            <Link href="/privacy" className="text-blue-600 hover:text-blue-700 hover:underline">
              {t('auth.register.privacyPolicy')}
            </Link>
          </Label>
        </div>

        {/* Submit Button */}
        <div
          className={cn(
            'relative group transition-all duration-500',
            isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          )}
          style={{ transitionDelay: getTransitionDelay(0.35) }}
        >
          <Button
            type="submit"
            disabled={isLoading}
            className={cn(
              ('relative w-full h-9 sm:h-10 bg-gradient-to-r from-blue-600 to-blue-500 ' +
                'hover:from-blue-700 hover:to-blue-600 text-white font-semibold text-sm ' +
                'rounded-lg transition-all duration-300 border-0 shadow-sm ' +
                'hover:shadow-md hover:shadow-blue-600/20'),
              !isLoading && 'active:scale-[0.98]'
            )}
          >
            {isLoading ? <Spinner size="sm" /> : t('auth.register.submitButton')}
          </Button>
        </div>
      </form>
    </div>
  );
}
