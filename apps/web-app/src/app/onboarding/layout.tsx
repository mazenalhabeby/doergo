'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { AuthSkeleton } from '@/components/auth';
import { AnimatedLogo } from '@hbcfield/shared/components';

/**
 * Onboarding shell. Sits between auth and the app: a signed-in user who hasn't
 * completed onboarding (no organization yet) lives here until they create an
 * org, join one by code, or accept an invitation.
 *
 * - Not authenticated → /login
 * - Already onboarded  → /dashboard (the app's FirstSpaceGate handles spaces)
 */
export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, isLoading, user } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.replace('/login');
      return;
    }
    // A completed user should never sit on the onboarding screens. One
    // exception: create-org, which hands off to /welcome.
    //
    // choose-plan used to be the other. It existed to make a new owner pick a
    // tier, and there are no tiers — the trial now simply runs, and what the
    // organization pays for is decided later by switching modules on where they
    // are used. Nothing routed to it any more either.
    if (user?.onboardingCompleted && !pathname.startsWith('/onboarding/create-org')) {
      router.replace('/dashboard');
    }
  }, [isLoading, isAuthenticated, user?.onboardingCompleted, pathname, router]);

  if (isLoading || !isAuthenticated) {
    return <AuthSkeleton />;
  }

  return (
    <div className="force-light fixed inset-0 z-10 overflow-y-auto bg-gradient-to-br from-slate-100 via-slate-50 to-slate-100 text-slate-900">
      {/* Brand header — shown on every onboarding step (path chooser, create/join
          org, invitation, choose plan, pending approval) so the flow stays
          consistently branded. */}
      <div className="flex min-h-full flex-col">
        <header className="flex shrink-0 justify-center px-4 pb-1 pt-8 sm:pt-10">
          <AnimatedLogo size="small" />
        </header>
        <main className="flex min-h-0 flex-1 flex-col">{children}</main>
      </div>
    </div>
  );
}
