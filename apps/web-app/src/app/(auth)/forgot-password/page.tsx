'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Mail, ArrowLeft, CheckCircle, Send } from 'lucide-react';
import { Button, Input, Label } from '@/components/ui';
import { AnimatedLogo } from '@/components/auth';
import { cn } from '@/lib/utils';
import { z } from 'zod';
import { authApi } from '@/lib/api';

const emailSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
});

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const result = emailSchema.safeParse({ email });
    if (!result.success) {
      setError(result.error.errors[0]?.message || 'Invalid email');
      return;
    }

    setIsLoading(true);

    try {
      await authApi.forgotPassword(email);

      setIsSubmitted(true);
      toast.success('Reset link sent!', {
        description: 'Check your email for password reset instructions.',
      });
    } catch (err) {
      toast.error('Failed to send reset link', {
        description: err instanceof Error ? err.message : 'Please try again later.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="bg-white rounded-2xl shadow-modal p-8">
        {/* Header */}
        <div className="flex flex-col items-center mb-8">
          <AnimatedLogo size="default" className="mb-4" />
          <h1 className="text-2xl font-semibold text-slate-900">
            {isSubmitted ? 'Check your email' : 'Forgot password?'}
          </h1>
          <p className="text-sm text-slate-500 mt-2 text-center">
            {isSubmitted
              ? `We've sent a password reset link to ${email}`
              : "No worries, we'll send you reset instructions."}
          </p>
        </div>

        {isSubmitted ? (
          <SuccessState email={email} onResend={() => setIsSubmitted(false)} />
        ) : (
          <ForgotPasswordForm
            email={email}
            setEmail={setEmail}
            error={error}
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

// ============================================================================
// Form Component
// ============================================================================

interface ForgotPasswordFormProps {
  email: string;
  setEmail: (email: string) => void;
  error: string;
  isLoading: boolean;
  onSubmit: (e: React.FormEvent) => void;
}

function ForgotPasswordForm({
  email,
  setEmail,
  error,
  isLoading,
  onSubmit,
}: ForgotPasswordFormProps) {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="email" className="text-sm font-medium text-slate-700">
          Email address
        </Label>
        <div
          className={cn(
            'relative transition-transform duration-200',
            isFocused && 'scale-[1.02]'
          )}
        >
          <Mail
            className={cn(
              'absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors duration-200',
              isFocused ? 'text-brand-600' : 'text-slate-400'
            )}
          />
          <Input
            id="email"
            type="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            className={cn(
              'pl-10 h-11 text-sm transition-all duration-200',
              error && 'border-error focus-visible:ring-error',
              isFocused && 'border-brand-600 ring-2 ring-brand-100'
            )}
            disabled={isLoading}
          />
        </div>
        {error && (
          <p className="text-xs text-error animate-fade-in">{error}</p>
        )}
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
            <Send className="w-4 h-4 mr-2" />
            Send reset link
          </>
        )}
      </Button>
    </form>
  );
}

// ============================================================================
// Success State Component
// ============================================================================

interface SuccessStateProps {
  email: string;
  onResend: () => void;
}

function SuccessState({ email, onResend }: SuccessStateProps) {
  return (
    <div className="space-y-6">
      {/* Success Icon */}
      <div className="flex justify-center">
        <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center animate-in zoom-in duration-300">
          <CheckCircle className="w-8 h-8 text-success" />
        </div>
      </div>

      {/* Email Preview */}
      <div className="bg-slate-50 rounded-lg p-4 text-center">
        <p className="text-sm text-slate-600">
          We sent a reset link to
        </p>
        <p className="text-sm font-medium text-slate-900 mt-1">{email}</p>
      </div>

      {/* Instructions */}
      <div className="space-y-3 text-sm text-slate-600">
        <p>
          Click the link in the email to reset your password. If you don't see the email:
        </p>
        <ul className="list-disc list-inside space-y-1 text-slate-500">
          <li>Check your spam folder</li>
          <li>Make sure you entered the correct email</li>
          <li>Wait a few minutes and try again</li>
        </ul>
      </div>

      {/* Resend Button */}
      <Button
        variant="outline"
        onClick={onResend}
        className="w-full h-11"
      >
        <Mail className="w-4 h-4 mr-2" />
        Try a different email
      </Button>
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
