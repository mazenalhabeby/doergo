"use client";

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AVAILABLE_MODULES, moduleI18n, type OrgCostBreakdown } from "@hbcfield/shared/client";

/** BillBreakdown's state and handlers — everything before its markup, moved here unchanged. */
export function useBillBreakdown({ bill, estimate }: Pick<{ bill: OrgCostBreakdown; estimate?: boolean }, 'bill' | 'estimate'>) {
  const { t } = useTranslation();

  const moduleLabel = (key: string) => {
    const english = AVAILABLE_MODULES.find((m) => m.key === key)?.label ?? key;
    return t(moduleI18n.label(key), { defaultValue: english });
  };

  const peopleCents = bill.seatMonthlyCents + bill.observerSeatMonthlyCents;
  const spacesCents = bill.spacesMonthlyCents + bill.usageMonthlyCents;
  const headcount = bill.seatCount + bill.observerSeatCount;

  /*
    Percentages for the bar, computed once.

    Guarded against a zero total: a brand-new organization with nothing switched
    on and nobody in it would otherwise divide by zero and render NaN% widths —
    an unstyled sliver rather than an empty bar.
  */
  /*
    What the parts add up to — which is NOT always what is charged.

    An organization on an agreed price pays €120 against €863 of product. The
    segments below are the real prices of the real things, so they must be
    divided by their own total; using the charged number would give three bands
    summing to 719% and a bar that ran off its own container.
  */
  const listTotal = bill.listMonthlyCents ?? bill.monthlyCents;

  const share = useMemo(() => {
    const total = listTotal;
    if (total <= 0) return { people: 0, spaces: 0, options: 0 };
    return {
      people: ((bill.seatMonthlyCents + bill.observerSeatMonthlyCents) / total) * 100,
      spaces: ((bill.spacesMonthlyCents + bill.usageMonthlyCents) / total) * 100,
      options: (bill.addOnsMonthlyCents / total) * 100,
    };
  }, [bill, listTotal]);

  return {
    t,
    moduleLabel,
    peopleCents,
    spacesCents,
    headcount,
    listTotal,
    share,
  };
}

/** What BillBreakdown and its sections read. */
export type BillBreakdownState = ReturnType<typeof useBillBreakdown>;
