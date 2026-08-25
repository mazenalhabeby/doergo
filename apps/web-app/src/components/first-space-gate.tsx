'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/auth-context';
import { locationsApi } from '@/lib/api';

/**
 * Sends an org owner who has no spaces yet to the "Set up your first space"
 * screen — so a new org can never reach the app with zero spaces (which would
 * make tasks space-less). Renders nothing.
 */
export function FirstSpaceGate() {
  const router = useRouter();
  const { user } = useAuth();
  const canManage = !!user?.canManageWorkspaces || !!user?.canManageUsers;

  const { data, isFetching } = useQuery({
    queryKey: ['locations'],
    queryFn: () => locationsApi.list({ includeInactive: true }),
    enabled: canManage,
    staleTime: 60000,
  });

  useEffect(() => {
    // Only act once the (re)fetch has settled — otherwise a stale empty cache
    // (e.g. right after creating the first space) bounces back to /welcome.
    if (canManage && !isFetching && data && (data.data?.length ?? 0) === 0) {
      router.replace('/welcome');
    }
  }, [canManage, isFetching, data, router]);

  return null;
}
