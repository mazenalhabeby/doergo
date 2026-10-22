'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { AnimatedLogo } from '@/components/auth';
import { useResetPasswordContent } from './_hooks/use-reset-password-content';
import { ResetPasswordForm, SuccessState } from './_components/reset-password-content-helpers';

function ResetPasswordContent() {
  const {
    t,
    token,
    password,
    setPassword,
    confirmPassword,
    setConfirmPassword,
    showPassword,
    setShowPassword,
    showConfirmPassword,
    setShowConfirmPassword,
    isLoading,
    isSuccess,
    errors,
    handleSubmit,
  } = useResetPasswordContent();

  if (!token) {
    return (
      <div className="w-full max-w-md mx-auto">
        <div className="bg-white rounded-2xl shadow-modal p-8">
          <div className="flex flex-col items-center mb-8">
            <AnimatedLogo size="default" className="mb-4 text-slate-900" />
            <h1 className="text-2xl font-semibold text-slate-900">{t('auth.resetPassword.invalidLinkTitle')}</h1>
            <p className="text-sm text-slate-500 mt-2 text-center">
              {t('auth.resetPassword.invalidLinkSubtitle')}
            </p>
          </div>
          <div className="mt-8 text-center">
            <Link
              href="/forgot-password"
              className="inline-flex items-center gap-2 text-sm text-brand-600 hover:text-brand-700 font-medium transition-colors"
            >
              {t('auth.resetPassword.requestNewLink')}
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
          <AnimatedLogo size="default" className="mb-4 text-slate-900" />
          <h1 className="text-2xl font-semibold text-slate-900">
            {isSuccess ? t('auth.resetPassword.successTitle') : t('auth.resetPassword.title')}
          </h1>
          <p className="text-sm text-slate-500 mt-2 text-center">
            {isSuccess
              ? t('auth.resetPassword.successSubtitle')
              : t('auth.resetPassword.subtitle')}
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
            {t('auth.resetPassword.backToSignIn')}
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
