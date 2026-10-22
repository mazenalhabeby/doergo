"use client"

import { useTranslation } from "react-i18next"
import type { SpaceMember } from "@hbcfield/shared/client"
import type { spaceMembersApi } from "@/lib/api"
import { cn } from "@/lib/utils"
import { BILL_BY, Segmented, useBillByLabel, type BillBy } from "./work-roles"

/** How a client is billed for this member: by the hour, the day or both, and which of their hours count. */
export function MemberBillingSection({
  member,
  bill,
  onUpdate,
  saving,
  section,
  heading,
}: {
  member: SpaceMember
  bill: BillBy
  onUpdate: (data: Parameters<typeof spaceMembersApi.updateRoles>[2]) => void
  saving: boolean
  section: string
  heading: string
}) {
  const { t } = useTranslation()
  const billByLabel = useBillByLabel()
  return (
    <section className={section}>
      <h3 className={heading}>{t("scheduling.membersPage.billing")}</h3>
      <Segmented
        ariaLabel={t("scheduling.workRoles.billBy")}
        value={bill}
        onChange={(v) => onUpdate({ billBy: v })}
        disabled={saving}
        options={BILL_BY.map((b) => ({ value: b, label: billByLabel(b) }))}
      />
      <p className="text-[11px] text-muted-foreground">{t("scheduling.workRoles.billByHint")}</p>
      {/*
        Which of their hours the CLIENT is charged. Their own pay and
        the margin's cost stay on counted time, whatever is chosen.
      */}
      {bill !== "DAY" && (
        <div className="space-y-1.5 pt-1">
          <p className="text-xs font-medium text-foreground">{t("scheduling.membersPage.hoursBasis")}</p>
          <div
            role="radiogroup"
            aria-label={t("scheduling.membersPage.hoursBasis")}
            className="grid gap-1 rounded-xl border border-border bg-muted/50 p-1"
          >
            {(["COUNTED", "CLOCKED", "SHIFT"] as const).map((b) => {
              const on = (member.effectiveHoursBasis ?? "COUNTED") === b
              return (
                <button
                  key={b}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={saving}
                  onClick={() => !on && onUpdate({ hoursBasis: b })}
                  className={cn(
                    "rounded-lg px-2.5 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    on ? "bg-card shadow-sm" : "hover:bg-card/60",
                  )}
                >
                  <span className="block text-xs font-semibold text-foreground">
                    {t(`scheduling.membersPage.basis.${b}`)}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    {t(`scheduling.membersPage.basis.${b}Hint`)}
                  </span>
                </button>
              )
            })}
          </div>
          <p className="text-[11px] text-muted-foreground">{t("scheduling.membersPage.hoursBasisHint")}</p>
        </div>
      )}
    </section>
  )
}
