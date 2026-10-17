'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, Mail, Lock } from 'lucide-react';
import { Input, Label } from '@/components/ui';
import { cn } from '@/lib/utils';

export interface LoginFormProps {
  isActive: boolean;
  isMobile?: boolean;
}

export interface ValidationErrors {
  email?: string;
  password?: string;
}

// ============================================================================
// Sub-components for form fields
// ============================================================================

export interface EmailFieldProps {
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

export function EmailField({
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

export interface PasswordFieldProps {
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

export function PasswordField({
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
