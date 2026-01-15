'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Lock, ArrowLeft, CheckCircle, Eye, EyeOff, KeyRound } from 'lucide-react';
import { Button, Input, Label } from '@/components/ui';
import { AnimatedLogo } from '@/components/auth';
import { cn } from '@/lib/utils';
import { z } from 'zod';
import { authApi } from '@/lib/api';

const passwordSchema = z.object({
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must not exceed 128 characters')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      'Password must contain at least one uppercase letter, one lowercase letter, and one number'
    ),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errors, setErrors] = useState<{ password?: string; confirmPassword?: string }>({});

  useEffect(() => {
    if (!token) {
      toast.error('Invalid reset link', {
        description: 'Please request a new password reset link.',
      });
    }
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const result = passwordSchema.safeParse({ password, confirmPassword });
    if (!result.success) {
      const fieldErrors: { password?: string; confirmPassword?: string } = {};
      result.error.errors.forEach((err) => {
        if (err.path[0] === 'password') fieldErrors.password = err.message;
        if (err.path[0] === 'confirmPassword') fieldErrors.confirmPassword = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    if (!token) {
      toast.error('Invalid reset link');
      return;
    }

    setIsLoading(true);

    try {
      await authApi.resetPassword(token, password);

      setIsSuccess(true);
      toast.success('Password reset successful!', {
        description: 'You can now sign in with your new password.',
      });

      // Redirect to login after 3 seconds
      setTimeout(() => {
        router.push('/login');
      }, 3000);
    } catch (err) {
      toast.error('Failed to reset password', {
        description: err instanceof Error ? err.message : 'Please try again or request a new reset link.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="w-full max-w-md mx-auto">
        <div className="bg-white rounded-2xl shadow-modal p-8">
          <div className="flex flex-col items-center mb-8">
            <AnimatedLogo size="default" className="mb-4" />
            <h1 className="text-2xl font-semibold text-slate-900">Invalid Link</h1>
            <p className="text-sm text-slate-500 mt-2 text-center">
              This password reset link is invalid or has expired.
            </p>
          </div>
          <div className="mt-8 text-center">
            <Link
              href="/forgot-password"
              className="inline-flex items-center gap-2 text-sm text-brand-600 hover:text-brand-700 font-medium transition-colors"
            >
              Request a new reset link
            </Link>
          </div>
          <div className="mt-4 text-center">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-brand-600 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="bg-white rounded-2xl shadow-modal p-8">
        {/* Header */}
        <div className="flex flex-col items-center mb-8">
          <AnimatedLogo size="default" className="mb-4" />
          <h1 className="text-2xl font-semibold text-slate-900">
            {isSuccess ? 'Password Reset!' : 'Reset your password'}
          </h1>
          <p className="text-sm text-slate-500 mt-2 text-center">
            {isSuccess
              ? 'Your password has been successfully reset.'
              : 'Enter your new password below.'}
          </p>
        </div>

        {isSuccess ? (
          <SuccessState />
        ) : (
          <ResetPasswordForm
            password={password}
            confirmPassword={confirmPassword}
            setPassword={setPassword}
            setConfirmPassword={setConfirmPassword}
            showPassword={showPassword}
            showConfirmPassword={showConfirmPassword}
            setShowPassword={setShowPassword}
            setShowConfirmPassword={setShowConfirmPassword}
            errors={errors}
            isLoading={isLoading}
            onSubmit={handleSubmit}
          />
        )}

        {/* Back to login */}
        <div className="mt-8 text-center">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-brand-600 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<ResetPasswordSkeleton />}>
      <ResetPasswordContent />
    </Suspense>
  );
}

// ============================================================================
// Form Component
// ============================================================================

interface ResetPasswordFormProps {
  password: string;
  confirmPassword: string;
  setPassword: (password: string) => void;
  setConfirmPassword: (confirmPassword: string) => void;
  showPassword: boolean;
  showConfirmPassword: boolean;
  setShowPassword: (show: boolean) => void;
  setShowConfirmPassword: (show: boolean) => void;
  errors: { password?: string; confirmPassword?: string };
  isLoading: boolean;
  onSubmit: (e: React.FormEvent) => void;
}

function ResetPasswordForm({
  password,
  confirmPassword,
  setPassword,
  setConfirmPassword,
  showPassword,
  showConfirmPassword,
  setShowPassword,
  setShowConfirmPassword,
  errors,
  isLoading,
  onSubmit,
}: ResetPasswordFormProps) {
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [confirmFocused, setConfirmFocused] = useState(false);

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {/* New Password */}
      <div className="space-y-2">
        <Label htmlFor="password" className="text-sm font-medium text-slate-700">
          New password
        </Label>
        <div
          className={cn(
            'relative transition-transform duration-200',
            passwordFocused && 'scale-[1.02]'
          )}
        >
          <Lock
            className={cn(
              'absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors duration-200',
              passwordFocused ? 'text-brand-600' : 'text-slate-400'
            )}
          />
          <Input
            id="password"
            type={showPassword ? 'text' : 'password'}
            placeholder="Enter new password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onFocus={() => setPasswordFocused(true)}
            onBlur={() => setPasswordFocused(false)}
            className={cn(
              'pl-10 pr-10 h-11 text-sm transition-all duration-200',
              errors.password && 'border-error focus-visible:ring-error',
              passwordFocused && 'border-brand-600 ring-2 ring-brand-100'
            )}
            disabled={isLoading}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        {errors.password && (
          <p className="text-xs text-error animate-fade-in">{errors.password}</p>
        )}
      </div>

      {/* Confirm Password */}
      <div className="space-y-2">
        <Label htmlFor="confirmPassword" className="text-sm font-medium text-slate-700">
          Confirm password
        </Label>
        <div
          className={cn(
            'relative transition-transform duration-200',
            confirmFocused && 'scale-[1.02]'
          )}
        >
          <Lock
            className={cn(
              'absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors duration-200',
              confirmFocused ? 'text-brand-600' : 'text-slate-400'
            )}
          />
          <Input
            id="confirmPassword"
            type={showConfirmPassword ? 'text' : 'password'}
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            onFocus={() => setConfirmFocused(true)}
            onBlur={() => setConfirmFocused(false)}
            className={cn(
              'pl-10 pr-10 h-11 text-sm transition-all duration-200',
              errors.confirmPassword && 'border-error focus-visible:ring-error',
              confirmFocused && 'border-brand-600 ring-2 ring-brand-100'
            )}
            disabled={isLoading}
          />
          <button
            type="button"
            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
          >
            {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        {errors.confirmPassword && (
          <p className="text-xs text-error animate-fade-in">{errors.confirmPassword}</p>
        )}
      </div>

      {/* Password Requirements */}
      <div className="text-xs text-slate-500 space-y-1">
        <p className="font-medium">Password must:</p>
        <ul className="list-disc list-inside space-y-0.5">
          <li>Be at least 8 characters long</li>
          <li>Contain at least one uppercase letter</li>
          <li>Contain at least one lowercase letter</li>
          <li>Contain at least one number</li>
        </ul>
      </div>

      <Button
        type="submit"
        disabled={isLoading}
        className={cn(
          'relative w-full h-11 bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-700 hover:to-brand-600 text-white font-semibold text-sm rounded-lg transition-all duration-300 border-0 shadow-sm hover:shadow-md hover:shadow-brand-600/20',
          !isLoading && 'active:scale-[0.98]'
        )}
      >
        {isLoading ? (
          <LoadingSpinner />
        ) : (
          <>
            <KeyRound className="w-4 h-4 mr-2" />
            Reset password
          </>
        )}
      </Button>
    </form>
  );
}

// ============================================================================
// Success State Component
// ============================================================================

function SuccessState() {
  return (
    <div className="space-y-6">
      {/* Success Icon */}
      <div className="flex justify-center">
        <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center animate-in zoom-in duration-300">
          <CheckCircle className="w-8 h-8 text-success" />
        </div>
      </div>

      {/* Success Message */}
      <div className="bg-slate-50 rounded-lg p-4 text-center">
        <p className="text-sm text-slate-600">
          Your password has been reset successfully.
        </p>
        <p className="text-sm text-slate-500 mt-2">
          You will be redirected to the login page in a few seconds...
        </p>
      </div>

      {/* Manual Login Button */}
      <Link href="/login">
        <Button variant="outline" className="w-full h-11">
          Sign in now
        </Button>
      </Link>
    </div>
  );
}

// ============================================================================
// Loading Skeleton
// ============================================================================

function ResetPasswordSkeleton() {
  return (
    <div className="w-full max-w-md mx-auto">
      <div className="bg-white rounded-2xl shadow-modal p-8">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 bg-slate-200 rounded-full animate-pulse mb-4" />
          <div className="w-48 h-6 bg-slate-200 rounded animate-pulse mb-2" />
          <div className="w-64 h-4 bg-slate-200 rounded animate-pulse" />
        </div>
        <div className="space-y-5">
          <div className="space-y-2">
            <div className="w-24 h-4 bg-slate-200 rounded animate-pulse" />
            <div className="w-full h-11 bg-slate-200 rounded animate-pulse" />
          </div>
          <div className="space-y-2">
            <div className="w-32 h-4 bg-slate-200 rounded animate-pulse" />
            <div className="w-full h-11 bg-slate-200 rounded animate-pulse" />
          </div>
          <div className="w-full h-11 bg-slate-200 rounded animate-pulse" />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Loading Spinner
// ============================================================================

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center">
      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
    </div>
  );
}
