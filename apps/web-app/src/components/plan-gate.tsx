'use client';

import Link from 'next/link';
import { Lock, ArrowUpRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/auth-context';
import { addOnDef, formatCents, isAddOn } from '@hbcfield/shared/client';
import { planFeatureLabel } from '@/lib/plan-features';

/**
 * Gates a premium page behind what the organization actually bought.
 *
 * It used to say "this is a Business feature — upgrade your plan", which named a
 * bundle and never a price. Now it names the thing and what it costs, because
 * that is the decision the person is being asked to make, and because there is
 * no longer a plan to move to.
 *
 * Purely a UX layer — PlanGuard enforces the same rule with a 402, so this can
 * never be the only line of defence.
 *
 * TWO KINDS OF THING can be gated, and they are bought in different places.
 * An ADD-ON is org-wide and lives in Billing. A MODULE is switched on per space,
 * and switching it on IS the purchase.
 *
 * `hasPlanFeature` answers only the first — it opens with `if (!isAddOn(...))
 * return false`, so asking it about a module always said no. `crm` is a module,
 * which is how a space with CRM switched on rendered its Customers tab and then
 * told the admin inside it that CRM was "not part of your subscription". Both
 * statements came from the same page.
 *
 * So a module is checked against the SPACE's own list, passed in by the caller
 * that already has it. With no list to check, the gate stands aside and lets the
 * request go: ModuleGuard answers it with a 402 for real, and a UX layer
 * guessing "no" is exactly what produced the contradiction.
 */
export function PlanGate({
  feature,
  modules,
  children,
}: {
  feature: string;
  /** The space's enabled modules, when the feature is a per-space module. */
  modules?: string[] | null;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const { hasPlanFeature, user } = useAuth();

  const isModule = !isAddOn(feature);
  const allowed = isModule
    ? (modules ? modules.includes(feature) : true)
    : hasPlanFeature(feature);
  if (allowed) return <>{children}</>;

  const def = addOnDef(feature);
  const label = planFeatureLabel(feature);
  const isAdmin = user?.role === 'ADMIN';

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center justify-center px-6 py-20 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10">
        <Lock className="size-6 text-primary" />
      </div>
      <h2 className="mt-5 text-xl font-semibold text-foreground">
        {def
          ? t('planGate.priced', '{{feature}} is {{price}} a month', {
              feature: label,
              price: formatCents(def.monthlyCents),
            })
          : t('planGate.unavailable', '{{feature}} is not part of your subscription', { feature: label })}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {isModule
          ? t('planGate.moduleHint', 'Switch it on for this space in its Modules tab.')
          : isAdmin
            ? t('planGate.adminHint', 'Add it in Billing and it is available straight away.')
            : t('planGate.memberHint', 'Ask an organization admin to add it.')}
      </p>
      {isAdmin && !isModule && (
        <Link
          href="/settings/billing"
          className="mt-6 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {t('planGate.cta', 'Add {{feature}}', { feature: label })} <ArrowUpRight className="size-4" />
        </Link>
      )}
    </div>
  );
}
