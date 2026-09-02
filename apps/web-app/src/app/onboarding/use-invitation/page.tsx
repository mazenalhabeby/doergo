'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Ticket, CheckCircle2 } from 'lucide-react';
import { Button, Input, Label, Spinner } from '@/components/ui';
import { notify } from '@/lib/toast';
import { useAuth } from '@/contexts/auth-context';
import { onboardingApi, invitationsApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { INVITATION_CODE_LENGTH, INVITATION_CODE_MIN_LENGTH } from '@hbcfield/shared/client'
import type { InvitationValidation } from '@hbcfield/shared/client'

/*
  The validation shape is the shared one, not a copy.

  A local duplicate is how `isExternal` reached this screen from the server and
  could not be read: the server sent it, the shared type declared it, and this
  file's private interface — four fields written out by hand — did not. It went
  missing silently, which is what copies of a contract do.
*/
type InvitationCheck = InvitationValidation;

export default function UseInvitationPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const { refreshUser } = useAuth();

  const [code, setCode] = useState('');
  const [validation, setValidation] = useState<InvitationCheck | null>(null);
  const [error, setError] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);

  const handleValidate = async () => {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length < INVITATION_CODE_MIN_LENGTH) {
      setError(t('onboarding.useInvitation.codeMustBe6Chars'));
      return;
    }
    setIsValidating(true);
    setError('');
    try {
      const result = (await invitationsApi.validate(trimmed)) as InvitationCheck;
      setValidation(result);
      if (!result?.valid) setError(result?.message || t('onboarding.useInvitation.invalidOrExpired'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('onboarding.useInvitation.invalidOrExpired'));
      setValidation(null);
    } finally {
      setIsValidating(false);
    }
  };

  const handleAccept = async () => {
    if (!validation?.valid) return;
    setIsAccepting(true);
    try {
      await onboardingApi.acceptInvitation(code.trim().toUpperCase());
      await refreshUser();
      router.replace('/dashboard');
    } catch (err) {
      notify.error(err instanceof Error ? err.message : t('onboarding.useInvitation.failedToAccept'));
      setIsAccepting(false);
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
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/25">
          <Ticket className="h-8 w-8" />
        </div>
        <h1 className="text-2xl font-semibold text-slate-900">{t('onboarding.useInvitation.title')}</h1>
        <p className="mt-1.5 text-sm text-slate-500">{t('onboarding.useInvitation.subtitle')}</p>
      </div>

      <div className="space-y-4 rounded-2xl bg-white p-6 shadow-modal">
        <div className="space-y-1.5">
          <Label htmlFor="invite-code" className="text-sm font-medium text-slate-700">
            {t('onboarding.useInvitation.codeLabel')}
          </Label>
          <div className="flex gap-2">
            <Input
              id="invite-code"
              autoFocus
              placeholder={t('onboarding.useInvitation.codePlaceholder')}
              value={code}
              maxLength={INVITATION_CODE_LENGTH}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase());
                setError('');
                setValidation(null);
              }}
              className={cn('h-11 text-center font-mono text-lg tracking-[0.3em]', error && 'border-error')}
              disabled={isValidating || isAccepting}
            />
            <Button
              type="button"
              onClick={handleValidate}
              disabled={isValidating || code.trim().length < INVITATION_CODE_MIN_LENGTH}
              className="h-11 shrink-0 bg-blue-600 px-5 font-semibold text-white hover:bg-blue-700"
            >
              {isValidating ? <Spinner size="sm" /> : t('onboarding.useInvitation.verify')}
            </Button>
          </div>
          {error && <p className="text-xs text-error">{error}</p>}
        </div>

        {validation?.valid && (
          <>
            <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-800">{validation.organizationName}</p>
                {validation.targetRole && (
                  <p className="text-xs text-slate-500">
                    {t('onboarding.useInvitation.joiningAs', {
                      // A translated word, not the raw enum — see the mobile
                      // screen, which had the identical bug in the same line.
                      role: validation.isExternal
                        ? t('onboarding.useInvitation.roleExternal')
                        : validation.targetRole === 'ADMIN'
                        ? t('onboarding.useInvitation.roleAdmin')
                        : t('onboarding.useInvitation.roleMember'),
                    })}
                  </p>
                )}
              </div>
            </div>

            <Button
              type="button"
              onClick={handleAccept}
              disabled={isAccepting}
              className="h-11 w-full bg-emerald-600 font-semibold text-white hover:bg-emerald-700"
            >
              {isAccepting ? <Spinner size="sm" /> : t('onboarding.useInvitation.submitButton')}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
