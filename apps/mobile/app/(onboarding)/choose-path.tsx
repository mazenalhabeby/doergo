import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { onboardingApi } from '@/lib/api';
import { ROUTES } from '@/lib/constants';
import { Ground } from '@/components/amazen';
import { PassScreen } from '@/features/onboarding/pass-screen';

/**
 * Where a signed-in member with no organization lands. A request still
 * waiting at reception goes straight to it — unless they came back from it
 * on purpose (`fresh`) to try another code.
 */
export default function ChoosePathScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string; fresh?: string }>();
  const [checking, setChecking] = useState(!params.fresh);

  useEffect(() => {
    if (params.fresh) return;
    let live = true;
    onboardingApi.getStatus()
      .then((status) => {
        if (live && status.hasPendingJoinRequest && status.pendingRequest?.status === 'PENDING') router.replace(ROUTES.pendingApproval as Href);
        else if (live) setChecking(false);
      })
      .catch(() => { if (live) setChecking(false); });
    return () => { live = false; };
  }, [params.fresh, router]);

  if (checking) return <Ground style={{ flex: 1 }} />;
  return <PassScreen initialCode={params.code} />;
}
