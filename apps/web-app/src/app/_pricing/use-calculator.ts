'use client';

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { orgMonthlyCost } from '@hbcfield/shared/client';

/**
 * The whole bill, built by the visitor, itemised to the cent.
 *
 * Everything here comes from `orgMonthlyCost` — the same function the invoice is
 * built from. A pricing page with its own arithmetic is a pricing page that
 * eventually lies, and this one has already been caught doing it once.
 *
 * The shape follows how somebody actually thinks about it: people first (the
 * only question with no wrong answer), then each site and what it does, then the
 * few things bought once for the company. A site starts with a sensible set
 * switched on rather than empty, because an empty configurator shows €0 and
 * teaches nothing.
 */

export type Site = { id: string; modules: string[]; units: Record<string, number> };

/** What a new site starts with — a field team's set, the common case. */
export const STARTER_MODULES = ['checklists', 'attachments', 'tracking', 'time_tracking', 'service_reports'];

/** Calculator's state and handlers — everything before its markup, moved here unchanged. */
export function useCalculator() {
  const { t } = useTranslation();

  const [people, setPeople] = useState(6);
  const [sites, setSites] = useState<Site[]>([{ id: '1', modules: [...STARTER_MODULES], units: {} }]);
  const [addOns, setAddOns] = useState<string[]>([]);
  const [openBill, setOpenBill] = useState(true);

  const bill = useMemo(
    () =>
      orgMonthlyCost({
        seatCount: people,
        spaces: sites.map((s, i) => ({
          spaceId: s.id,
          spaceName: t('pricing.calc.siteN', 'Site {{n}}', { n: i + 1 }),
          enabledModules: s.modules,
          usage: s.units,
        })),
        addOns,
      }),
    [people, sites, addOns, t],
  );

  const perPerson = Math.round(bill.monthlyCents / Math.max(1, people));

  const setSite = (id: string, fn: (s: Site) => Site) =>
    setSites((prev) => prev.map((s) => (s.id === id ? fn(s) : s)));

  const toggleModule = (id: string, key: string) =>
    setSite(id, (s) => {
      const on = s.modules.includes(key);
      const modules = on ? s.modules.filter((k) => k !== key) : [...s.modules, key];
      // Drop a count with its module: a number left behind for something
      // switched off is invisible here and would be a surprise on an invoice.
      const units = { ...s.units };
      if (on) delete units[key];
      return { ...s, modules, units };
    });

  const toggleGroup = (id: string, keys: string[]) =>
    setSite(id, (s) => {
      const allOn = keys.every((k) => s.modules.includes(k));
      const modules = allOn ? s.modules.filter((k) => !keys.includes(k)) : [...new Set([...s.modules, ...keys])];
      const units = { ...s.units };
      if (allOn) keys.forEach((k) => delete units[k]);
      return { ...s, modules, units };
    });

  return {
    t,
    people,
    setPeople,
    sites,
    setSites,
    addOns,
    setAddOns,
    openBill,
    setOpenBill,
    bill,
    perPerson,
    setSite,
    toggleModule,
    toggleGroup,
  };
}
