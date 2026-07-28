"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import {
  CreditCard,
  ArrowUpRight,
  ArrowDownLeft,
  DollarSign,
  Calendar,
  Search,
} from "lucide-react"

import { useAuth } from "@/contexts/auth-context"
import { invoicesApi } from "@/lib/api"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

function formatCurrency(amount: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount)
}

export default function PaymentsPage() {
  const { t } = useTranslation()
  const { user } = useAuth()

  // Payments are derived from paid/refunded invoices
  const { data, isLoading } = useQuery({
    queryKey: ["invoices", "paid"],
    queryFn: () => invoicesApi.list({ status: "PAID", limit: 100 }),
  })

  const paidInvoices = (data as any)?.data || []

  const totalReceived = paidInvoices.reduce((sum: number, inv: any) => sum + (inv.total || 0), 0)

  return (
    <div className="min-h-full bg-background">
      <div className="p-8 max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 data-tour="page-payments" className="text-2xl font-semibold text-foreground">{t("payments.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("payments.subtitle")}</p>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-card rounded-xl border border-border p-4">
            <p className="text-xs text-muted-foreground font-medium mb-1">{t("payments.totalReceived")}</p>
            <p className="text-2xl font-bold text-green-600 tabular-nums">{formatCurrency(totalReceived)}</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-4">
            <p className="text-xs text-muted-foreground font-medium mb-1">{t("payments.paidInvoices")}</p>
            <p className="text-2xl font-bold text-foreground tabular-nums">{paidInvoices.length}</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-4">
            <p className="text-xs text-muted-foreground font-medium mb-1">{t("payments.averageInvoice")}</p>
            <p className="text-2xl font-bold text-foreground tabular-nums">
              {paidInvoices.length > 0 ? formatCurrency(totalReceived / paidInvoices.length) : "$0.00"}
            </p>
          </div>
        </div>

        {/* Payment history */}
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border/40">
            <h3 className="text-sm font-semibold text-foreground">{t("payments.paymentHistory")}</h3>
          </div>

          {isLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
            </div>
          ) : paidInvoices.length === 0 ? (
            <div className="text-center py-12">
              <CreditCard className="size-10 mx-auto text-muted-foreground/20 mb-3" />
              <p className="text-sm text-muted-foreground">{t("payments.empty")}</p>
              <p className="text-xs text-muted-foreground/60 mt-1">{t("payments.emptyHint")}</p>
            </div>
          ) : (
            paidInvoices.map((inv: any) => (
              <div key={inv.id} className="flex items-center gap-3 px-4 py-3 border-b border-border/20 last:border-0 hover:bg-muted/20 transition-colors">
                <div className="size-8 rounded-full bg-green-100 dark:bg-green-500/20 flex items-center justify-center flex-shrink-0">
                  <ArrowDownLeft className="size-4 text-green-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{inv.clientName}</p>
                  <p className="text-[11px] text-muted-foreground">{inv.invoiceNumber}</p>
                </div>
                <span className="text-sm font-semibold text-green-600 tabular-nums">
                  +{formatCurrency(inv.total, inv.currency)}
                </span>
                <span className="text-xs text-muted-foreground w-20 text-right">
                  {inv.paidAt ? new Date(inv.paidAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
