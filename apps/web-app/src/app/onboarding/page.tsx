'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Building2, Users, Ticket, ArrowRight, LogOut } from 'lucide-react';
import { AnimatedLogo } from '@hbcfield/shared/components';
import { Spinner } from '@/components/ui';
import { useAuth } from '@/contexts/auth-context';
import { onboardingApi } from '@/lib/api';
import { cn } from '@/lib/utils';

const PATHS = [
  {
    id: 'create',
    href: '/onboarding/create-org',
    Icon: Building2,
    accent: 'text-blue-600',
    ring: 'group-hover:border-blue-300',
    iconBg: 'bg-blue-100',
    tagBg: 'bg-blue-100 text-blue-700',
  },
  {
    id: 'join',
    href: '/onboarding/join-org',
    Icon: Users,
    accent: 'text-violet-600',
    ring: 'group-hover:border-violet-300',
    iconBg: 'bg-violet-100',
    tagBg: 'bg-violet-100 text-violet-700',
  },
  {
    id: 'invitation',
    href: '/onboarding/use-invitation',
    Icon: Ticket,
    accent: 'text-emerald-600',
    ring: 'group-hover:border-emerald-300',
    iconBg: 'bg-emerald-100',
    tagBg: 'bg-emerald-100 text-emerald-700',
  },
] as const;

export default function ChoosePathPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const status = await onboardingApi.getStatus();
        if (active && status.hasPendingJoinRequest && status.pendingRequest?.status === 'PENDING') {
          router.replace('/onboarding/pending-approval');
          return;
        }
      } catch {
        // Non-fatal: show the paths anyway.
      } finally {
        if (active) setChecking(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [router]);

  if (checking) {
    return (
      <div className="flex min-h-full items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-xl flex-col justify-center px-4 py-10 sm:px-6">
      <div className="mb-8 flex flex-col items-center text-center">
        <AnimatedLogo size="default" className="mb-5" />
        <h1 className="text-2xl font-semibold text-slate-900">
          {t('onboarding.choosePath.welcome', { name: user?.firstName ?? '' })}
        </h1>
        <p className="mt-1.5 text-sm text-slate-500">{t('onboarding.choosePath.subtitle')}</p>
      </div>

      <div className="space-y-3">
        {PATHS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => router.push(p.href)}
            className={cn(
              'group flex w-full items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-all hover:shadow-md',
              p.ring,
            )}
          >
            <div className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-xl', p.iconBg)}>
              <p.Icon className={cn('h-6 w-6', p.accent)} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center gap-2">
                <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide', p.tagBg)}>
                  {t(`onboarding.choosePath.${p.id === 'create' ? 'createOrg' : p.id === 'join' ? 'joinOrg' : 'useInvitation'}.tag`)}
                </span>
              </div>
              <h2 className="truncate text-base font-semibold text-slate-900">
                {t(`onboarding.choosePath.${p.id === 'create' ? 'createOrg' : p.id === 'join' ? 'joinOrg' : 'useInvitation'}.title`)}
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {t(`onboarding.choosePath.${p.id === 'create' ? 'createOrg' : p.id === 'join' ? 'joinOrg' : 'useInvitation'}.description`)}
              </p>
            </div>
            <ArrowRight className="h-5 w-5 shrink-0 text-slate-300 transition-colors group-hover:text-slate-500" />
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={logout}
        className="mx-auto mt-8 flex items-center gap-1.5 text-xs font-medium text-slate-400 transition-colors hover:text-slate-600"
      >
        <LogOut className="h-3.5 w-3.5" />
        {t('onboarding.choosePath.signOut')}
      </button>
    </div>
  );
}
