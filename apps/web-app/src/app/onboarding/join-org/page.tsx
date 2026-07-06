'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Users, CheckCircle2 } from 'lucide-react';
import { Button, Input, Label, Spinner } from '@/components/ui';
import { notify } from '@/lib/toast';
import { useAuth } from '@/contexts/auth-context';
import { onboardingApi, type OrgCodeValidation } from '@/lib/api';
import { cn } from '@/lib/utils';

export default function JoinOrgPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const { refreshUser } = useAuth();

  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [validation, setValidation] = useState<OrgCodeValidation | null>(null);
  const [error, setError] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleValidate = async () => {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length !== 8) {
      setError(t('onboarding.joinOrg.codeMustBe8Chars'));
      return;
    }
    setIsValidating(true);
    setError('');
    try {
      const result = await onboardingApi.validateOrgCode(trimmed);
      setValidation(result);
      if (!result.valid) setError(result.message || t('onboarding.joinOrg.invalidCode'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('onboarding.joinOrg.invalidCode'));
      setValidation(null);
    } finally {
      setIsValidating(false);
    }
  };

  const handleSubmit = async () => {
    if (!validation?.valid) return;
    setIsSubmitting(true);
    try {
      const result = await onboardingApi.submitJoinRequest({
        orgCode: code.trim().toUpperCase(),
        message: message.trim() || undefined,
      });
      if (result?.autoApproved) {
        await refreshUser();
        router.replace('/dashboard');
      } else {
        router.replace('/onboarding/pending-approval');
      }
    } catch (err) {
      notify.error(err instanceof Error ? err.message : t('onboarding.joinOrg.failedToSubmit'));
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center px-4 py-10 sm:px-6">
      <button
        type="button"
        onClick={() => router.back()}
        className="mb-6 flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" />
        {t('common.back')}
      </button>

      <div className="mb-6 flex flex-col items-center text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-600 text-white shadow-lg shadow-violet-600/25">
          <Users className="h-8 w-8" />
        </div>
        <h1 className="text-2xl font-semibold text-slate-900">{t('onboarding.joinOrg.title')}</h1>
        <p className="mt-1.5 text-sm text-slate-500">{t('onboarding.joinOrg.subtitle')}</p>
      </div>

      <div className="space-y-4 rounded-2xl bg-white p-6 shadow-modal">
        <div className="space-y-1.5">
          <Label htmlFor="org-code" className="text-sm font-medium text-slate-700">
            {t('onboarding.joinOrg.codeLabel')}
          </Label>
          <div className="flex gap-2">
            <Input
              id="org-code"
              autoFocus
              placeholder={t('onboarding.joinOrg.codePlaceholder')}
              value={code}
              maxLength={8}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase());
                setError('');
                setValidation(null);
              }}
              className={cn('h-11 text-center font-mono text-lg tracking-[0.3em]', error && 'border-error')}
              disabled={isValidating || isSubmitting}
            />
            <Button
              type="button"
              onClick={handleValidate}
              disabled={isValidating || code.trim().length !== 8}
              className="h-11 shrink-0 bg-blue-600 px-5 font-semibold text-white hover:bg-blue-700"
            >
              {isValidating ? <Spinner size="sm" /> : t('onboarding.joinOrg.verify')}
            </Button>
          </div>
          {error && <p className="text-xs text-error">{error}</p>}
        </div>

        {validation?.valid && (
          <>
            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
              <span className="text-sm font-semibold text-slate-800">{validation.organizationName}</span>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="join-message" className="text-sm font-medium text-slate-700">
                {t('onboarding.joinOrg.messageLabel')}
              </Label>
              <textarea
                id="join-message"
                rows={3}
                maxLength={500}
                placeholder={t('onboarding.joinOrg.messagePlaceholder')}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full resize-none rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-900 outline-none transition-colors focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                disabled={isSubmitting}
              />
              <p className="text-right text-[11px] text-slate-400">{message.length}/500</p>
            </div>

            <Button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="h-11 w-full bg-violet-600 font-semibold text-white hover:bg-violet-700"
            >
              {isSubmitting ? <Spinner size="sm" /> : t('onboarding.joinOrg.submitButton')}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
