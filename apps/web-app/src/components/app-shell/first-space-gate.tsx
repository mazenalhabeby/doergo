'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { useSpaceDirectory } from '@/hooks/use-space-directory';

/**
 * Sends an org owner who has no spaces yet to the "Set up your first space"
 * screen — so a new org can never reach the app with zero spaces (which would
 * make tasks space-less). Renders nothing.
 *
 * Reads the shared workspace directory, which the task page, the dashboard and
 * every task row's module check read too — so this costs no request of its own.
 */
export function FirstSpaceGate() {
  const router = useRouter();
  const { user } = useAuth();
  const canManage = !!user?.canManageWorkspaces || !!user?.canManageUsers;

  const { data, isFetching } = useSpaceDirectory({ enabled: canManage });

  useEffect(() => {
    // Only act once the (re)fetch has settled — otherwise a stale empty cache
    // (e.g. right after creating the first space) bounces back to /welcome.
    if (canManage && !isFetching && data && data.length === 0) {
      router.replace('/welcome');
    }
  }, [canManage, isFetching, data, router]);

  return null;
}
