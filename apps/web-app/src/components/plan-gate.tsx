'use client';

import Link from 'next/link';
import { Lock, ArrowUpRight } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { minTierForFeature, PLANS, type PlanTier } from '@hbcfield/shared/client';
import { planFeatureLabel } from '@/lib/plan-features';

/**
 * Gates a premium page/section behind the org's billing tier. When the tier is
 * entitled, renders children. Otherwise renders an "Upgrade" panel pointing to
 * Settings → Billing. Purely a UX layer — the API enforces the same gate (402),
 * so this can never be the only line of defense.
 */
export function PlanGate({ feature, children }: { feature: string; children: React.ReactNode }) {
  const { hasPlanFeature, user } = useAuth();
  if (hasPlanFeature(feature)) return <>{children}</>;

  const needed = minTierForFeature(feature) as PlanTier | null;
  const neededName = needed ? PLANS[needed].name : 'a higher plan';
  const isAdmin = user?.role === 'ADMIN';

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center justify-center px-6 py-20 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10">
        <Lock className="size-6 text-primary" />
      </div>
      <h2 className="mt-5 text-xl font-semibold text-foreground">
        {planFeatureLabel(feature)} is a {neededName} feature
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Upgrade your plan to unlock {planFeatureLabel(feature).toLowerCase()}
        {isAdmin ? '.' : ' — ask an organization admin to upgrade.'}
      </p>
      {isAdmin && (
        <Link
          href="/settings/billing"
          className="mt-6 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Upgrade to {neededName} <ArrowUpRight className="size-4" />
        </Link>
      )}
    </div>
  );
}
