"use client"

import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { FileText, Plus } from "lucide-react"

import { invoicesApi, type Invoice } from "@/lib/api"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  DRAFT: { bg: "bg-slate-100 dark:bg-slate-500/20", text: "text-slate-600 dark:text-slate-400" },
  SENT: { bg: "bg-blue-100 dark:bg-blue-500/20", text: "text-blue-700 dark:text-blue-400" },
  PAID: { bg: "bg-green-100 dark:bg-green-500/20", text: "text-green-700 dark:text-green-400" },
  OVERDUE: { bg: "bg-red-100 dark:bg-red-500/20", text: "text-red-700 dark:text-red-400" },
  CANCELED: { bg: "bg-slate-100 dark:bg-slate-500/20", text: "text-slate-500" },
  REFUNDED: { bg: "bg-amber-100 dark:bg-amber-500/20", text: "text-amber-700 dark:text-amber-400" },
}

function money(n: number, currency = "EUR") {
  try {
    return new Intl.NumberFormat("en-IE", { style: "currency", currency: currency || "EUR" }).format(n || 0)
  } catch {
    return `${(n || 0).toFixed(2)} ${currency}`
  }
}

export function InvoicesTab({ spaceId, spaceName }: { spaceId: string; spaceName: string }) {
  const { t, i18n } = useTranslation()
  const router = useRouter()

  const { data, isLoading } = useQuery({
    queryKey: ["invoices", "space", spaceId],
    queryFn: () => invoicesApi.list({ spaceId, limit: 100 }),
  })
  const invoices: Invoice[] = data?.data ?? []

  const outstanding = invoices
    .filter((i) => i.status === "SENT" || i.status === "OVERDUE")
    .reduce((s: number, i: Invoice) => s + (i.total || 0), 0)
  const paid = invoices.filter((i) => i.status === "PAID").reduce((s: number, i: Invoice) => s + (i.total || 0), 0)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex gap-6">
          <div>
            <p className="text-xs text-muted-foreground">{t("invoices.outstanding")}</p>
            <p className="text-lg font-bold tabular-nums">{money(outstanding)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t("invoices.paid")}</p>
            <p className="text-lg font-bold tabular-nums text-green-600">{money(paid)}</p>
          </div>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => router.push(`/invoices/new?spaceId=${spaceId}`)}>
          <Plus className="size-3.5" /> {t("invoices.newInvoice")}
        </Button>
      </div>

      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
          </div>
        ) : invoices.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="size-10 mx-auto text-muted-foreground/20 mb-3" />
            <p className="text-sm text-muted-foreground">{t("invoices.emptyForSpace", { name: spaceName })}</p>
            <p className="text-xs text-muted-foreground/60 mt-1">{t("invoices.emptyForSpaceHint")}</p>
          </div>
        ) : (
          invoices.map((inv) => {
            const status = STATUS_STYLES[inv.status] || STATUS_STYLES.DRAFT!
            return (
              <div
                key={inv.id}
                onClick={() => router.push(`/invoices/${inv.id}`)}
                className="grid grid-cols-[110px_1fr_120px_90px] gap-3 px-4 py-3 border-b border-border/20 last:border-0 hover:bg-muted/20 transition-colors items-center cursor-pointer"
              >
                <span className="text-sm font-mono font-medium text-foreground">{inv.invoiceNumber}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(inv.issueDate).toLocaleDateString(i18n.language, { day: "2-digit", month: "short", year: "numeric" })}
                </span>
                <span className="text-sm font-semibold text-right tabular-nums">{money(inv.total, inv.currency)}</span>
                <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full text-center", status.bg, status.text)}>
                  {t(`invoices.statuses.${(inv.status || "DRAFT").toLowerCase()}`)}
                </span>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
