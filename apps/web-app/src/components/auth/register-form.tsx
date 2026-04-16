'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Eye, EyeOff, Mail, Lock, User, Building2, Check } from 'lucide-react';
import { Button, Input, Label, Checkbox, Spinner } from '@/components/ui';
import { useAuth } from '@/contexts/auth-context';
import { authApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { registerSchema, passwordRequirements, type RegisterFormData } from '@/lib/validation';
import { SocialLoginButtons } from './social-login-buttons';

interface RegisterFormProps {
  isActive: boolean;
  isMobile?: boolean;
}

type ValidationErrors = Partial<Record<keyof RegisterFormData, string>>;

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
    companyName: '',
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
      toast.error(t('auth.register.validationErrorTitle'), {
        description: result.error.errors[0]?.message || t('auth.register.validationErrorDescription'),
      });
      setIsLoading(false);
      return;
    }

    try {
      await authApi.register({
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        password: formData.password,
        companyName: formData.companyName,
      });

      await login(formData.email, formData.password);
      toast.success(t('auth.register.successTitle'), {
        description: t('auth.register.successDescription'),
      });
      router.push('/dashboard');
    } catch (err) {
      toast.error(t('auth.register.errorTitle'), {
        description: err instanceof Error ? err.message : t('auth.register.errorDescription'),
      });
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
      focusedField === field && 'border-brand-600 ring-2 ring-brand-100',
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

        {/* Company */}
        <CompanyField
          value={formData.companyName}
          onChange={(v) => updateField('companyName', v)}
          error={validationErrors.companyName}
          isLoading={isLoading}
          isActive={isActive}
          focusedField={focusedField}
          onFocusChange={setFocusedField}
          inputClass={inputClass}
          transitionDelay={getTransitionDelay(0.1)}
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
            className="mt-0.5 data-[state=checked]:bg-brand-600 data-[state=checked]:border-brand-600"
          />
          <Label
            htmlFor="reg-terms"
            className="text-[10px] sm:text-[11px] text-slate-600 cursor-pointer leading-tight hover:text-slate-900 transition-colors"
          >
            {t('auth.register.termsPrefix')}{' '}
            <Link href="/terms" className="text-brand-600 hover:text-brand-700 hover:underline">
              {t('auth.register.termsOfService')}
            </Link>{' '}
            {t('auth.register.termsAnd')}{' '}
            <Link href="/privacy" className="text-brand-600 hover:text-brand-700 hover:underline">
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
              'relative w-full h-9 sm:h-10 bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-700 hover:to-brand-600 text-white font-semibold text-sm rounded-lg transition-all duration-300 border-0 shadow-sm hover:shadow-md hover:shadow-brand-600/20',
              !isLoading && 'active:scale-[0.98]'
            )}
          >
            {isLoading ? <Spinner size="sm" /> : t('auth.register.submitButton')}
          </Button>
        </div>

        {/* Social Login */}
        <SocialLoginButtons
          isLoading={isLoading}
          isActive={isActive}
          isMobile={isMobile}
          transitionDelay={getTransitionDelay(0.4)}
        />
      </form>
    </div>
  );
}

// ============================================================================
// Sub-components for form fields
// ============================================================================

interface InputClassFn {
  (field: string, hasError: boolean): string;
}

interface NameFieldsProps {
  firstName: string;
  lastName: string;
  onFirstNameChange: (value: string) => void;
  onLastNameChange: (value: string) => void;
  errors: ValidationErrors;
  isLoading: boolean;
  isActive: boolean;
  focusedField: string | null;
  onFocusChange: (field: string | null) => void;
  inputClass: InputClassFn;
  transitionDelay: string;
}

function NameFields({
  firstName,
  lastName,
  onFirstNameChange,
  onLastNameChange,
  errors,
  isLoading,
  isActive,
  focusedField,
  onFocusChange,
  inputClass,
  transitionDelay,
}: NameFieldsProps) {
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-2 transition-all duration-500',
        isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      )}
      style={{ transitionDelay }}
    >
      <div className="space-y-1">
        <Label htmlFor="reg-firstName" className="text-xs font-medium text-slate-700">
          {t('auth.register.firstNameLabel')}
        </Label>
        <div className="relative">
          <User
            className={cn(
              'absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 transition-colors',
              focusedField === 'firstName' ? 'text-brand-600' : 'text-slate-400'
            )}
          />
          <Input
            id="reg-firstName"
            type="text"
            placeholder={t('auth.register.firstNamePlaceholder')}
            value={firstName}
            onChange={(e) => onFirstNameChange(e.target.value)}
            onFocus={() => onFocusChange('firstName')}
            onBlur={() => onFocusChange(null)}
            className={cn('pl-8', inputClass('firstName', !!errors.firstName))}
            disabled={isLoading}
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="reg-lastName" className="text-xs font-medium text-slate-700">
          {t('auth.register.lastNameLabel')}
        </Label>
        <Input
          id="reg-lastName"
          type="text"
          placeholder={t('auth.register.lastNamePlaceholder')}
          value={lastName}
          onChange={(e) => onLastNameChange(e.target.value)}
          onFocus={() => onFocusChange('lastName')}
          onBlur={() => onFocusChange(null)}
          className={inputClass('lastName', !!errors.lastName)}
          disabled={isLoading}
        />
      </div>
    </div>
  );
}

interface CompanyFieldProps {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  isLoading: boolean;
  isActive: boolean;
  focusedField: string | null;
  onFocusChange: (field: string | null) => void;
  inputClass: InputClassFn;
  transitionDelay: string;
}

function CompanyField({
  value,
  onChange,
  error,
  isLoading,
  isActive,
  focusedField,
  onFocusChange,
  inputClass,
  transitionDelay,
}: CompanyFieldProps) {
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        'space-y-1 transition-all duration-500',
        isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      )}
      style={{ transitionDelay }}
    >
      <Label htmlFor="reg-company" className="text-xs font-medium text-slate-700">
        {t('auth.register.companyNameLabel')}
      </Label>
      <div className="relative">
        <Building2
          className={cn(
            'absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 transition-colors',
            focusedField === 'company' ? 'text-brand-600' : 'text-slate-400'
          )}
        />
        <Input
          id="reg-company"
          type="text"
          placeholder={t('auth.register.companyNamePlaceholder')}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => onFocusChange('company')}
          onBlur={() => onFocusChange(null)}
          className={cn('pl-8', inputClass('company', !!error))}
          disabled={isLoading}
        />
      </div>
    </div>
  );
}

interface EmailFieldProps {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  isLoading: boolean;
  isActive: boolean;
  focusedField: string | null;
  onFocusChange: (field: string | null) => void;
  inputClass: InputClassFn;
  transitionDelay: string;
}

function EmailField({
  value,
  onChange,
  error,
  isLoading,
  isActive,
  focusedField,
  onFocusChange,
  inputClass,
  transitionDelay,
}: EmailFieldProps) {
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        'space-y-1 transition-all duration-500',
        isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      )}
      style={{ transitionDelay }}
    >
      <Label htmlFor="reg-email" className="text-xs font-medium text-slate-700">
        {t('auth.register.workEmailLabel')}
      </Label>
      <div className="relative">
        <Mail
          className={cn(
            'absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 transition-colors',
            focusedField === 'reg-email' ? 'text-brand-600' : 'text-slate-400'
          )}
        />
        <Input
          id="reg-email"
          type="email"
          placeholder={t('auth.register.workEmailPlaceholder')}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => onFocusChange('reg-email')}
          onBlur={() => onFocusChange(null)}
          className={cn('pl-8', inputClass('reg-email', !!error))}
          disabled={isLoading}
        />
      </div>
    </div>
  );
}

interface PasswordFieldProps {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  isLoading: boolean;
  isActive: boolean;
  showPassword: boolean;
  onTogglePassword: () => void;
  focusedField: string | null;
  onFocusChange: (field: string | null) => void;
  inputClass: InputClassFn;
  transitionDelay: string;
}

function PasswordField({
  value,
  onChange,
  error,
  isLoading,
  isActive,
  showPassword,
  onTogglePassword,
  focusedField,
  onFocusChange,
  inputClass,
  transitionDelay,
}: PasswordFieldProps) {
  const { t } = useTranslation();

  const passwordRequirementLabels: Record<string, string> = {
    '8+ chars': t('auth.passwordRequirements.minChars'),
    'Upper': t('auth.passwordRequirements.uppercase'),
    'Lower': t('auth.passwordRequirements.lowercase'),
    'Number': t('auth.passwordRequirements.number'),
  };

  return (
    <div
      className={cn(
        'space-y-1 transition-all duration-500',
        isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      )}
      style={{ transitionDelay }}
    >
      <Label htmlFor="reg-password" className="text-xs font-medium text-slate-700">
        {t('auth.register.passwordLabel')}
      </Label>
      <div className="relative">
        <Lock
          className={cn(
            'absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 transition-colors',
            focusedField === 'reg-password' ? 'text-brand-600' : 'text-slate-400'
          )}
        />
        <Input
          id="reg-password"
          type={showPassword ? 'text' : 'password'}
          placeholder={t('auth.register.passwordPlaceholder')}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => onFocusChange('reg-password')}
          onBlur={() => onFocusChange(null)}
          className={cn('pl-8 pr-8', inputClass('reg-password', !!error))}
          disabled={isLoading}
        />
        <button
          type="button"
          onClick={onTogglePassword}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-all hover:scale-110"
        >
          {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
        </button>
      </div>
      {/* Password Requirements */}
      {value && (
        <div className="flex flex-wrap gap-x-2 sm:gap-x-3 gap-y-1 mt-1">
          {passwordRequirements.map((req, i) => (
            <span
              key={i}
              className={cn(
                'text-[10px] flex items-center gap-1 transition-all duration-300',
                req.test(value) ? 'text-success scale-105' : 'text-slate-400'
              )}
            >
              <Check
                className={cn(
                  'w-2.5 h-2.5 transition-transform',
                  req.test(value) && 'animate-bounce-once'
                )}
              />
              {passwordRequirementLabels[req.label] || req.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

interface ConfirmPasswordFieldProps {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  isLoading: boolean;
  isActive: boolean;
  focusedField: string | null;
  onFocusChange: (field: string | null) => void;
  inputClass: InputClassFn;
  transitionDelay: string;
}

function ConfirmPasswordField({
  value,
  onChange,
  error,
  isLoading,
  isActive,
  focusedField,
  onFocusChange,
  inputClass,
  transitionDelay,
}: ConfirmPasswordFieldProps) {
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        'space-y-1 transition-all duration-500',
        isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      )}
      style={{ transitionDelay }}
    >
      <Label htmlFor="reg-confirmPassword" className="text-xs font-medium text-slate-700">
        {t('auth.register.confirmPasswordLabel')}
      </Label>
      <div className="relative">
        <Lock
          className={cn(
            'absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 transition-colors',
            focusedField === 'confirmPassword' ? 'text-brand-600' : 'text-slate-400'
          )}
        />
        <Input
          id="reg-confirmPassword"
          type="password"
          placeholder={t('auth.register.confirmPasswordPlaceholder')}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => onFocusChange('confirmPassword')}
          onBlur={() => onFocusChange(null)}
          className={cn('pl-8', inputClass('confirmPassword', !!error))}
          disabled={isLoading}
        />
      </div>
      {error && <p className="text-[10px] text-error animate-fade-in">{error}</p>}
    </div>
  );
}
