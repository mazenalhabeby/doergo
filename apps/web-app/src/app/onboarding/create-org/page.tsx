'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Building2 } from 'lucide-react';
import { Button, Input, Label, Spinner } from '@/components/ui';
import { notify } from '@/lib/toast';
import { useAuth } from '@/contexts/auth-context';
import { onboardingApi } from '@/lib/api';
import { cn } from '@/lib/utils';

export default function CreateOrgPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const { refreshUser } = useAuth();

  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError(t('onboarding.createOrg.nameTooShort'));
      return;
    }

    setIsLoading(true);
    setError('');
    try {
      await onboardingApi.createOrganization({ name: trimmed });
      // Refresh so the session reflects the new org + onboardingCompleted, then
      // hand off to the existing first-space setup (same flow org owners see).
      await refreshUser();
      router.replace('/welcome');
    } catch (err) {
      notify.error(err instanceof Error ? err.message : t('onboarding.createOrg.failed'));
      setIsLoading(false);
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
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/25">
          <Building2 className="h-8 w-8" />
        </div>
        <h1 className="text-2xl font-semibold text-slate-900">{t('onboarding.createOrg.title')}</h1>
        <p className="mt-1.5 text-sm text-slate-500">{t('onboarding.createOrg.subtitle')}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl bg-white p-6 shadow-modal">
        <div className="space-y-1.5">
          <Label htmlFor="org-name" className="text-sm font-medium text-slate-700">
            {t('onboarding.createOrg.nameLabel')}
          </Label>
          <Input
            id="org-name"
            autoFocus
            placeholder={t('onboarding.createOrg.namePlaceholder')}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError('');
            }}
            className={cn('h-11', error && 'border-error')}
            disabled={isLoading}
          />
          {error && <p className="text-xs text-error">{error}</p>}
        </div>

        <Button
          type="submit"
          disabled={isLoading}
          className="h-11 w-full bg-blue-600 font-semibold text-white hover:bg-blue-700"
        >
          {isLoading ? <Spinner size="sm" /> : t('onboarding.createOrg.submitButton')}
        </Button>
      </form>
    </div>
  );
}
