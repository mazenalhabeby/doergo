"use client"

import { useTranslation } from "react-i18next"
import type { TaskReport } from "@hbcfield/shared/client"
import { formatAmount } from "@/lib/money"
import { partsTotal } from "../_lib/report-model"

/** The parts used on the job; their prices (and the sum) only where the copy shows prices. */
export function ReportParts({
  parts,
  showPrices,
  currency,
}: {
  parts: NonNullable<TaskReport["parts"]>
  showPrices: boolean
  currency: TaskReport["header"]["currency"]
}) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || "en"
  const money = (n: number | null | undefined) => (n == null ? "—" : formatAmount(n, currency, locale))
  const total = partsTotal(parts)
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[28rem] text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500">
            <th className="py-2 font-medium">{t("tasks.report.parts.part")}</th>
            <th className="py-2 font-medium">{t("tasks.report.parts.number")}</th>
            <th className="py-2 text-right font-medium">{t("tasks.report.parts.qty")}</th>
            {showPrices ? <th className="py-2 text-right font-medium">{t("tasks.report.parts.unit")}</th> : null}
            {showPrices ? <th className="py-2 text-right font-medium">{t("tasks.report.parts.total")}</th> : null}
          </tr>
        </thead>
        <tbody>
          {parts.map((p) => (
            <tr key={p.id} className="border-b border-slate-100 align-top">
              <td className="py-2 pr-3">
                {p.name}
                {p.notes ? <span className="block text-xs text-slate-400">{p.notes}</span> : null}
              </td>
              <td className="py-2 pr-3 text-slate-500">{p.partNumber ?? "—"}</td>
              <td className="py-2 text-right tabular-nums">{p.quantity.toLocaleString(locale)}</td>
              {showPrices ? <td className="py-2 text-right tabular-nums">{money(p.unitPrice)}</td> : null}
              {showPrices ? <td className="py-2 text-right tabular-nums">{money(p.lineTotal)}</td> : null}
            </tr>
          ))}
        </tbody>
        {showPrices && total != null ? (
          <tfoot>
            <tr className="font-semibold text-slate-900">
              <td className="py-2" colSpan={4}>
                {t("tasks.report.parts.sum")}
              </td>
              <td className="py-2 text-right tabular-nums">{money(total)}</td>
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  )
}
