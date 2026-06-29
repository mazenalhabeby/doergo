'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { notify } from '@/lib/toast';
import { AuthSkeleton, LoginForm, RegisterForm } from '@/components/auth';
import { useAuth } from '@/contexts/auth-context';
import { AnimatedLogo } from '@hbcfield/shared/components';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

const HERO_BG = 'linear-gradient(135deg,#1D4ED8 0%,#2563EB 45%,#06B6D4 130%)';
const GRID =
  'linear-gradient(rgba(255,255,255,.10) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.10) 1px,transparent 1px)';

function AuthPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useTranslation();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const [isLogin, setIsLogin] = useState(true);

  // "Account created" → switch to sign-in
  useEffect(() => {
    if (searchParams.get('registered') === 'true') {
      notify.success(t('auth.page.accountCreatedTitle'), t('auth.page.accountCreatedDescription'));
      setIsLogin(true);
      router.replace('/login', { scroll: false });
    }
  }, [searchParams, router]);

  // Redirect if already signed in
  useEffect(() => {
    if (!authLoading && isAuthenticated) router.push('/dashboard');
  }, [authLoading, isAuthenticated, router]);

  if (authLoading) return <AuthSkeleton />;

  const tab = (active: boolean) =>
    cn(
      'flex-1 text-center py-2 text-sm font-semibold rounded-lg transition-all',
      active ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-600',
    );

  return (
    <div className="force-light fixed inset-0 z-10 flex flex-col lg:flex-row overflow-y-auto bg-white text-slate-900">
      {/* ── Left: brand hero (desktop only) ───────────────────────────── */}
      <aside
        className="relative hidden lg:flex lg:w-[54%] flex-col justify-between overflow-hidden p-10 xl:p-14 text-white"
        style={{ background: HERO_BG }}
      >
        <div className="absolute inset-0 opacity-40" style={{ backgroundImage: GRID, backgroundSize: '34px 34px' }} />
        <div
          className="absolute -right-20 -top-20 h-80 w-80 rounded-full"
          style={{ background: 'radial-gradient(circle,rgba(34,211,238,.45),transparent 60%)' }}
        />

        <div className="relative">
          <AnimatedLogo variant="light" size="default" />
        </div>

        <div className="relative">
          <h2 className="text-4xl xl:text-5xl font-extrabold leading-[1.05] tracking-tight">
            {t('auth.hero.line1')}<br />{t('auth.hero.line2')}
          </h2>
          <p className="mt-4 max-w-sm text-[15px] text-white/75">
            {t('auth.hero.subtitle')}
          </p>

          <div className="mt-8 flex gap-3">
            <div className="w-[170px] rounded-xl border border-white/20 bg-white/[.14] p-3.5 backdrop-blur">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-300" />
                <span className="text-[11px] text-white/80">{t('auth.hero.inProgress')}</span>
              </div>
              <div className="mt-1 text-[13px] font-semibold">{t('auth.hero.sampleTask')}</div>
              <div className="mt-1 text-[10px] text-white/60">{t('auth.hero.sampleTaskMeta')}</div>
            </div>
            <div className="w-[128px] rounded-xl border border-white/20 bg-white/[.14] p-3.5 backdrop-blur">
              <div className="text-[10px] text-white/70">{t('common.today')}</div>
              <div className="mt-0.5 text-[24px] font-extrabold leading-none">18</div>
              <div className="mt-1 text-[10px] text-white/60">{t('auth.hero.tasksCompleted')}</div>
            </div>
          </div>
        </div>

        <div className="relative text-[11px] text-white/55">{t('auth.hero.footer')}</div>
      </aside>

      {/* ── Right: form ───────────────────────────────────────────────── */}
      <main className="flex flex-1 flex-col justify-center bg-white px-6 py-12 sm:px-10 lg:px-16">
        <div className="mx-auto w-full max-w-md">
          {/* mobile logo */}
          <div className="mb-9 mt-2 flex justify-center lg:hidden">
            <AnimatedLogo size="large" />
          </div>

          <h1 className="text-[26px] font-bold tracking-tight text-slate-900">
            {isLogin ? t('auth.login.title') : t('auth.register.title')}
          </h1>
          <p className="mt-1 mb-6 text-sm text-slate-500">
            {isLogin ? t('auth.page.signInSubtitle') : t('auth.page.signUpSubtitle')}
          </p>

          {/* tabs */}
          <div className="mb-6 flex gap-1 rounded-[10px] bg-slate-100 p-1">
            <button type="button" onClick={() => setIsLogin(true)} className={tab(isLogin)}>
              {t('auth.page.signInTab')}
            </button>
            <button type="button" onClick={() => setIsLogin(false)} className={tab(!isLogin)}>
              {t('auth.page.createAccountTab')}
            </button>
          </div>

          {isLogin ? <LoginForm isActive isMobile /> : <RegisterForm isActive isMobile />}
        </div>
      </main>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={<AuthSkeleton />}>
      <AuthPageContent />
    </Suspense>
  );
}
