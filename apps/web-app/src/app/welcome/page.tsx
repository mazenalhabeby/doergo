'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/auth-context';
import { AnimatedLogo } from '@hbcfield/shared/components';
import { SpaceForm } from '@/app/(dashboard)/locations/_components/space-form';

export default function WelcomePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.replace('/login');
  }, [authLoading, isAuthenticated, router]);

  // After the first space is created, refetch the spaces cache (incl. the gate's
  // inactive query) so the dashboard sees it immediately — no bounce back here.
  const handleCreated = async () => {
    await queryClient.refetchQueries({ queryKey: ['locations'], type: 'all' });
    router.replace('/dashboard');
  };

  return (
    <div className="force-light fixed inset-0 z-10 flex items-center justify-center overflow-y-auto bg-gradient-to-br from-slate-100 via-slate-50 to-slate-100 p-4 text-slate-900 sm:p-8">
      <div className="my-auto w-full max-w-lg rounded-2xl bg-white p-8 shadow-modal">
        <div className="mb-7 flex flex-col items-center text-center">
          <AnimatedLogo size="default" className="mb-4" />
          <h1 className="text-2xl font-semibold text-slate-900">{t('welcome.title')}</h1>
          <p className="mt-1.5 text-sm text-slate-500">
            {t('welcome.subtitle')}
          </p>
        </div>

        {/* Same form as the New-Space dialog — name, type, workflow & modules. */}
        <SpaceForm onCreated={handleCreated} submitLabel={t('welcome.createAndContinue')} autoFocus />
      </div>
    </div>
  );
}
