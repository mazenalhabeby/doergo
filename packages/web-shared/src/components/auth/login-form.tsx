'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Eye, EyeOff, Mail, Lock } from 'lucide-react';
import { Button, Input, Label, Checkbox, Spinner } from '../ui';
import { cn } from '../../lib/utils';
import { loginSchema } from '../../lib/validation';
import { SocialLoginButtons } from './social-login-buttons';

interface LoginFormProps {
  isActive: boolean;
  isMobile?: boolean;
  redirectTo?: string;
  onLogin: (email: string, password: string, rememberMe: boolean) => Promise<void>;
  showSocialLogin?: boolean;
  title?: string;
  subtitle?: string;
}

interface ValidationErrors {
  email?: string;
  password?: string;
}

export function LoginForm({
  isActive,
  isMobile = false,
  redirectTo = '/dashboard',
  onLogin,
  showSocialLogin = true,
  title = 'Welcome back',
  subtitle = 'Sign in to access your dashboard',
}: LoginFormProps) {
  const router = useRouter();

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
      toast.error('Please fix the errors', {
        description: result.error.errors[0]?.message || 'Please fill all required fields correctly',
      });
      setIsLoading(false);
      return;
    }

    try {
      await onLogin(email, password, rememberMe);
      toast.success('Welcome back!', {
        description: 'You have been signed in successfully.',
      });
      router.push(redirectTo);
    } catch (err) {
      toast.error('Sign in failed', {
        description: err instanceof Error ? err.message : 'Invalid email or password',
      });
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
            {title}
          </h1>
          <p className="text-xs lg:text-sm text-slate-500">{subtitle}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className={cn('space-y-3', !isMobile && 'lg:space-y-4')}>
        {/* Email Field */}
        <div
          className={cn(
            'space-y-1.5 sm:space-y-2 transition-all duration-500',
            isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          )}
          style={{ transitionDelay: getTransitionDelay(0.15) }}
        >
          <Label htmlFor="login-email" className="text-xs sm:text-sm font-medium text-slate-700">
            Email
          </Label>
          <div
            className={cn(
              'relative transition-transform duration-200',
              focusedField === 'email' && !isMobile && 'scale-[1.02]'
            )}
          >
            <Mail
              className={cn(
                'absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors duration-200',
                focusedField === 'email' ? 'text-brand-600' : 'text-slate-400'
              )}
            />
            <Input
              id="login-email"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onFocus={() => setFocusedField('email')}
              onBlur={() => setFocusedField(null)}
              className={cn(
                'pl-10 h-10 sm:h-11 text-sm transition-all duration-200',
                validationErrors.email && 'border-error focus-visible:ring-error',
                focusedField === 'email' && 'border-brand-600 ring-2 ring-brand-100'
              )}
              disabled={isLoading}
            />
          </div>
          {validationErrors.email && (
            <p className="text-xs text-error animate-fade-in">{validationErrors.email}</p>
          )}
        </div>

        {/* Password Field */}
        <div
          className={cn(
            'space-y-1.5 sm:space-y-2 transition-all duration-500',
            isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          )}
          style={{ transitionDelay: getTransitionDelay(0.2) }}
        >
          <div className="flex items-center justify-between">
            <Label htmlFor="login-password" className="text-xs sm:text-sm font-medium text-slate-700">
              Password
            </Label>
            <Link
              href="/forgot-password"
              className="text-xs text-brand-600 hover:text-brand-700 font-medium hover:underline transition-all"
            >
              Forgot password?
            </Link>
          </div>
          <div
            className={cn(
              'relative transition-transform duration-200',
              focusedField === 'password' && !isMobile && 'scale-[1.02]'
            )}
          >
            <Lock
              className={cn(
                'absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors duration-200',
                focusedField === 'password' ? 'text-brand-600' : 'text-slate-400'
              )}
            />
            <Input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={() => setFocusedField('password')}
              onBlur={() => setFocusedField(null)}
              className={cn(
                'pl-10 pr-10 h-10 sm:h-11 text-sm transition-all duration-200',
                validationErrors.password && 'border-error focus-visible:ring-error',
                focusedField === 'password' && 'border-brand-600 ring-2 ring-brand-100'
              )}
              disabled={isLoading}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors hover:scale-110"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {validationErrors.password && (
            <p className="text-xs text-error animate-fade-in">{validationErrors.password}</p>
          )}
        </div>

        {/* Remember Me */}
        <div
          className={cn(
            'flex items-center gap-2 transition-all duration-500',
            isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          )}
          style={{ transitionDelay: getTransitionDelay(0.25) }}
        >
          <Checkbox
            id="login-remember"
            checked={rememberMe}
            onCheckedChange={(checked) => setRememberMe(checked as boolean)}
            className="data-[state=checked]:bg-brand-600 data-[state=checked]:border-brand-600"
          />
          <Label
            htmlFor="login-remember"
            className="text-xs sm:text-sm text-slate-600 cursor-pointer hover:text-slate-900 transition-colors"
          >
            Keep me signed in
          </Label>
        </div>

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
              'relative w-full h-10 sm:h-11 bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-700 hover:to-brand-600 text-white font-semibold text-sm rounded-lg transition-all duration-300 border-0 shadow-sm hover:shadow-md hover:shadow-brand-600/20',
              !isLoading && 'active:scale-[0.98]'
            )}
          >
            {isLoading ? <Spinner size="sm" /> : 'Sign in to Dashboard'}
          </Button>
        </div>

        {/* Social Login */}
        {showSocialLogin && (
          <SocialLoginButtons
            isLoading={isLoading}
            isActive={isActive}
            isMobile={isMobile}
            transitionDelay={getTransitionDelay(0.35)}
          />
        )}
      </form>
    </div>
  );
}
