'use client';

import { useTranslation } from 'react-i18next';
import { useTheme } from 'next-themes';
import { AVAILABLE_MODULES } from '@hbcfield/shared/client';
import { ungroupedModuleKeys } from '@/lib/capability-groups';
import { asArray } from '@/app/_home/i18n-array';

/** PricingClient's state and handlers — everything before its markup, moved here unchanged. */
export function usePricingClient() {
  const { t } = useTranslation();
  const { resolvedTheme, setTheme } = useTheme();

  // Every module reaches exactly one group. If one is ever added to the
  // catalogue and not to a group it would silently vanish from the one page
  // promising "every price", so it lands in an "everything else" row instead.
  const orphans = ungroupedModuleKeys(AVAILABLE_MODULES.map((m) => m.key as string));

  /*
    `returnObjects` hands back the raw strings and i18next does not interpolate
    into a returned object, so any `{{placeholder}}` in these would reach the
    screen verbatim. There are none, and a test keeps it that way.
  */
  const rules = asArray<{ title: string; body: string }>(t('pricing.rules', { returnObjects: true }));

  return { t, resolvedTheme, setTheme, orphans, rules };
}
