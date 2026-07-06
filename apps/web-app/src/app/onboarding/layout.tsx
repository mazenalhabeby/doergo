'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { AuthSkeleton } from '@/components/auth';

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
    // A completed user should never sit on the onboarding screens. The only
    // exception is the create-org path, which hands off to /welcome itself.
    if (user?.onboardingCompleted && !pathname.startsWith('/onboarding/create-org')) {
      router.replace('/dashboard');
    }
  }, [isLoading, isAuthenticated, user?.onboardingCompleted, pathname, router]);

  if (isLoading || !isAuthenticated) {
    return <AuthSkeleton />;
  }

  return (
    <div className="force-light fixed inset-0 z-10 overflow-y-auto bg-gradient-to-br from-slate-100 via-slate-50 to-slate-100 text-slate-900">
      {children}
    </div>
  );
}
