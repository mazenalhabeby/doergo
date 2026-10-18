'use client';

import { useTranslation } from 'react-i18next';
import { Lock } from 'lucide-react';
import { Input, Label } from '@/components/ui';
import { cn } from '@/lib/utils';
import { type InputClassFn } from './register-password-field';

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

export function ConfirmPasswordField({
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
            focusedField === 'confirmPassword' ? 'text-blue-600' : 'text-slate-400'
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
