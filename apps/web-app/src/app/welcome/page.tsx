'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/auth-context';
import { SetupWizard } from './_wizard/setup-wizard';

export default function WelcomePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.replace('/login');
  }, [authLoading, isAuthenticated, router]);

  // Setup created the org's spaces — refetch the spaces cache (incl. the gate's
  // inactive query) so the dashboard sees them immediately, then send the org
  // owner straight to their dashboard on the 14-day trial. We intentionally skip
  // the "Choose your plan" step during signup — owners can subscribe any time
  // from Settings → Billing (the billing banner also surfaces it).
  //
  // Use a hard navigation for the handoff: `/welcome` and `/(dashboard)` live in
  // different route groups, and a client-side transition can fail to fetch the
  // dashboard layout chunk. A full load is robust and this is a one-time step.
  const handleFinish = async () => {
    await queryClient.refetchQueries({ queryKey: ['locations'], type: 'all' });
    window.location.assign('/dashboard');
  };

  return <SetupWizard onFinish={handleFinish} />;
}
