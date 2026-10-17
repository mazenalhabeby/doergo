"use client"

import { type PartUsed } from "@/lib/api"
import { useAuth } from "@/contexts/auth-context"
import { formatAmount } from "@/lib/money"
import { useTranslation } from "react-i18next"

/** PartsTable, moved here unchanged out of service-report-section.tsx. */
export function PartsTable({ parts }: { parts: PartUsed[] }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  // Was a hard-coded "$" on a European product — the organization's currency.
  const money = (amount: number) => formatAmount(amount, user?.orgCurrency)
  if (parts.length === 0) {
    return (
      <div className="text-center py-4 text-sm text-muted-foreground">
        {t("tasks.serviceReport.noParts")}
      </div>
    )
  }

  const totalCost = parts.reduce((sum, part) => sum + (part.unitCost || 0) * part.quantity, 0)

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-2 px-3 font-medium text-foreground">{t("tasks.serviceReport.partsTable.part")}</th>
            <th className="text-left py-2 px-3 font-medium text-foreground">{t("tasks.serviceReport.partsTable.partNumber")}</th>
            <th className="text-center py-2 px-3 font-medium text-foreground">{t("tasks.serviceReport.partsTable.qty")}</th>
            <th className="text-right py-2 px-3 font-medium text-foreground">{t("tasks.serviceReport.partsTable.unitCost")}</th>
            <th className="text-right py-2 px-3 font-medium text-foreground">{t("tasks.serviceReport.partsTable.total")}</th>
          </tr>
        </thead>
        <tbody>
          {parts.map((part) => (
            <tr key={part.id} className="border-b border-border">
              <td className="py-2 px-3">
                <div>
                  <span className="text-foreground">{part.name}</span>
                  {part.notes && (
                    <span className="block text-xs text-muted-foreground">{part.notes}</span>
                  )}
                </div>
              </td>
              <td className="py-2 px-3 text-muted-foreground">{part.partNumber || "-"}</td>
              <td className="py-2 px-3 text-center text-muted-foreground">{part.quantity}</td>
              <td className="py-2 px-3 text-right text-muted-foreground">
                {part.unitCost ? money(part.unitCost) : "-"}
              </td>
              <td className="py-2 px-3 text-right text-foreground font-medium">
                {part.unitCost ? money(part.unitCost * part.quantity) : "-"}
              </td>
            </tr>
          ))}
        </tbody>
        {totalCost > 0 && (
          <tfoot>
            <tr className="bg-muted">
              <td colSpan={4} className="py-2 px-3 text-right font-medium text-foreground">
                {t("tasks.serviceReport.totalParts")}
              </td>
              <td className="py-2 px-3 text-right font-semibold text-foreground">
                {money(totalCost)}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}
