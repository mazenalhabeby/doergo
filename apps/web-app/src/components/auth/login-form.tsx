'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { notify } from '@/lib/toast';
import { Eye, EyeOff, Mail, Lock } from 'lucide-react';
import { Button, Input, Label, Spinner } from '@/components/ui';
import { useAuth } from '@/contexts/auth-context';
import { cn } from '@/lib/utils';
import { loginSchema } from '@/lib/validation';

interface LoginFormProps {
  isActive: boolean;
  isMobile?: boolean;
}

interface ValidationErrors {
  email?: string;
  password?: string;
}

export function LoginForm({ isActive, isMobile = false }: LoginFormProps) {
  const router = useRouter();
  const { login } = useAuth();
  const { t } = useTranslation();

  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setValidationErrors({});

    const result = loginSchema.safeParse({ email, password });
    if (!result.success) {
      const fieldErrors: ValidationErrors = {};
      result.error.errors.forEach((err) => {
        if (err.path[0] === 'email') fieldErrors.email = err.message;
        if (err.path[0] === 'password') fieldErrors.password = err.message;
      });
      setValidationErrors(fieldErrors);
      notify.error(result.error.errors[0]?.message || t('auth.login.validationErrorDescription'));
      setIsLoading(false);
      return;
    }

    try {
      await login(email, password, rememberMe);
      notify.success(t('auth.login.successTitle'), t('auth.login.successDescription'));
      router.push('/dashboard');
    } catch (err) {
      notify.error(err instanceof Error ? err.message : t('auth.login.errorDescription'));
    } finally {
      setIsLoading(false);
    }
  };

  const getTransitionDelay = (baseDelay: number) => {
    return isMobile ? '0s' : `${baseDelay}s`;
  };

  return (
    <div className={cn('flex flex-col justify-center', !isMobile && 'h-full')}>
      {/* Header - hidden on mobile */}
      {!isMobile && (
        <div
          className={cn(
            'space-y-2 mb-4 lg:mb-6 transition-all duration-500',
            isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          )}
          style={{ transitionDelay: '0.1s' }}
        >
          <h1 className="text-xl lg:text-2xl font-semibold tracking-tight text-slate-900">
            {t('auth.login.title')}
          </h1>
          <p className="text-xs lg:text-sm text-slate-500">
            {t('auth.login.subtitle')}
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className={cn('space-y-3', !isMobile && 'lg:space-y-4')}>
        {/* Email Field */}
        <EmailField
          value={email}
          onChange={setEmail}
          error={validationErrors.email}
          isLoading={isLoading}
          isActive={isActive}
          isMobile={isMobile}
          focusedField={focusedField}
          onFocusChange={setFocusedField}
          transitionDelay={getTransitionDelay(0.15)}
        />

        {/* Password Field */}
        <PasswordField
          value={password}
          onChange={setPassword}
          error={validationErrors.password}
          isLoading={isLoading}
          isActive={isActive}
          isMobile={isMobile}
          showPassword={showPassword}
          onTogglePassword={() => setShowPassword(!showPassword)}
          focusedField={focusedField}
          onFocusChange={setFocusedField}
          transitionDelay={getTransitionDelay(0.2)}
        />

        {/* Remember me — web sessions are 24h by default; opt into 30 days */}
        <label
          className={cn(
            'flex items-center gap-2 text-xs sm:text-sm text-slate-600 select-none cursor-pointer transition-all duration-500',
            isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          )}
          style={{ transitionDelay: getTransitionDelay(0.25) }}
        >
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            disabled={isLoading}
            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          {t('auth.login.rememberMe', { defaultValue: 'Keep me signed in for 30 days' })}
        </label>

        {/* Submit Button */}
        <div
          className={cn(
            'relative group transition-all duration-500',
            isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          )}
          style={{ transitionDelay: getTransitionDelay(0.3) }}
        >
          <Button
            type="submit"
            disabled={isLoading}
            className={cn(
              'relative w-full h-10 sm:h-11 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white font-semibold text-sm rounded-lg transition-all duration-300 border-0 shadow-sm hover:shadow-md hover:shadow-blue-600/20',
              !isLoading && 'active:scale-[0.98]'
            )}
          >
            {isLoading ? <Spinner size="sm" /> : t('auth.login.submitButton')}
          </Button>
        </div>
      </form>
    </div>
  );
}

// ============================================================================
// Sub-components for form fields
// ============================================================================

interface EmailFieldProps {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  isLoading: boolean;
  isActive: boolean;
  isMobile: boolean;
  focusedField: string | null;
  onFocusChange: (field: string | null) => void;
  transitionDelay: string;
}

function EmailField({
  value,
  onChange,
  error,
  isLoading,
  isActive,
  isMobile,
  focusedField,
  onFocusChange,
  transitionDelay,
}: EmailFieldProps) {
  const { t } = useTranslation();
  const isFocused = focusedField === 'email';

  return (
    <div
      className={cn(
        'space-y-1.5 sm:space-y-2 transition-all duration-500',
        isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      )}
      style={{ transitionDelay }}
    >
      <Label htmlFor="login-email" className="text-xs sm:text-sm font-medium text-slate-700">
        {t('auth.login.emailLabel')}
      </Label>
      <div
        className={cn(
          'relative transition-transform duration-200',
          isFocused && !isMobile && 'scale-[1.02]'
        )}
      >
        <Mail
          className={cn(
            'absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors duration-200',
            isFocused ? 'text-blue-600' : 'text-slate-400'
          )}
        />
        <Input
          id="login-email"
          type="email"
          placeholder={t('auth.login.emailPlaceholder')}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => onFocusChange('email')}
          onBlur={() => onFocusChange(null)}
          className={cn(
            'pl-10 h-10 sm:h-11 text-sm transition-all duration-200',
            error && 'border-error focus-visible:ring-error',
            isFocused && 'border-blue-600 ring-2 ring-blue-100'
          )}
          disabled={isLoading}
        />
      </div>
      {error && <p className="text-xs text-error animate-fade-in">{error}</p>}
    </div>
  );
}

interface PasswordFieldProps {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  isLoading: boolean;
  isActive: boolean;
  isMobile: boolean;
  showPassword: boolean;
  onTogglePassword: () => void;
  focusedField: string | null;
  onFocusChange: (field: string | null) => void;
  transitionDelay: string;
}

function PasswordField({
  value,
  onChange,
  error,
  isLoading,
  isActive,
  isMobile,
  showPassword,
  onTogglePassword,
  focusedField,
  onFocusChange,
  transitionDelay,
}: PasswordFieldProps) {
  const { t } = useTranslation();
  const isFocused = focusedField === 'password';

  return (
    <div
      className={cn(
        'space-y-1.5 sm:space-y-2 transition-all duration-500',
        isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      )}
      style={{ transitionDelay }}
    >
      <div className="flex items-center justify-between">
        <Label htmlFor="login-password" className="text-xs sm:text-sm font-medium text-slate-700">
          {t('auth.login.passwordLabel')}
        </Label>
        <Link
          href="/forgot-password"
          className="text-xs text-blue-600 hover:text-blue-700 font-medium hover:underline transition-all"
        >
          {t('auth.login.forgotPassword')}
        </Link>
      </div>
      <div
        className={cn(
          'relative transition-transform duration-200',
          isFocused && !isMobile && 'scale-[1.02]'
        )}
      >
        <Lock
          className={cn(
            'absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors duration-200',
            isFocused ? 'text-blue-600' : 'text-slate-400'
          )}
        />
        <Input
          id="login-password"
          type={showPassword ? 'text' : 'password'}
          placeholder={t('auth.login.passwordPlaceholder')}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => onFocusChange('password')}
          onBlur={() => onFocusChange(null)}
          className={cn(
            'pl-10 pr-10 h-10 sm:h-11 text-sm transition-all duration-200',
            error && 'border-error focus-visible:ring-error',
            isFocused && 'border-blue-600 ring-2 ring-blue-100'
          )}
          disabled={isLoading}
        />
        <button
          type="button"
          onClick={onTogglePassword}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors hover:scale-110"
        >
          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      {error && <p className="text-xs text-error animate-fade-in">{error}</p>}
    </div>
  );
}
