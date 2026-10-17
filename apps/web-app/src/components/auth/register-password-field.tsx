'use client';

import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, Mail, Lock, User, Check } from 'lucide-react';
import { Input, Label } from '@/components/ui';
import { cn } from '@/lib/utils';
import { passwordRequirements, type RegisterFormData } from '@/lib/validation';

export interface RegisterFormProps {
  isActive: boolean;
  isMobile?: boolean;
}

export type ValidationErrors = Partial<Record<keyof RegisterFormData, string>>;

// ============================================================================
// Sub-components for form fields
// ============================================================================

export interface InputClassFn {
  (field: string, hasError: boolean): string;
}

export interface NameFieldsProps {
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

export function NameFields({
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
              focusedField === 'firstName' ? 'text-blue-600' : 'text-slate-400'
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

export interface EmailFieldProps {
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

export function EmailField({
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
            focusedField === 'reg-email' ? 'text-blue-600' : 'text-slate-400'
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

export interface PasswordFieldProps {
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

export function PasswordField({
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
            focusedField === 'reg-password' ? 'text-blue-600' : 'text-slate-400'
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
