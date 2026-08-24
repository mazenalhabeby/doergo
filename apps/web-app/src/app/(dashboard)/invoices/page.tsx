"use client"

import { PlanGate } from "@/components/plan-gate"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import {
  FileText,
  Plus,
  Search,
  MoreHorizontal,
  Send,
  CheckCircle,
  XCircle,
  DollarSign,
  Calendar,
  Eye,
} from "lucide-react"

import { useAuth } from "@/contexts/auth-context"
import { invoicesApi, type Invoice } from "@/lib/api"
import { cn } from "@/lib/utils"
import { notify } from "@/lib/toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { dateLocale } from "@/lib/format-date"

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  DRAFT: { bg: "bg-slate-100 dark:bg-slate-500/20", text: "text-slate-600 dark:text-slate-400", label: "Draft" },
  SENT: { bg: "bg-blue-100 dark:bg-blue-500/20", text: "text-blue-700 dark:text-blue-400", label: "Sent" },
  PAID: { bg: "bg-green-100 dark:bg-green-500/20", text: "text-green-700 dark:text-green-400", label: "Paid" },
  OVERDUE: { bg: "bg-red-100 dark:bg-red-500/20", text: "text-red-700 dark:text-red-400", label: "Overdue" },
  CANCELED: { bg: "bg-slate-100 dark:bg-slate-500/20", text: "text-slate-500 dark:text-slate-500", label: "Canceled" },
  REFUNDED: { bg: "bg-amber-100 dark:bg-amber-500/20", text: "text-amber-700 dark:text-amber-400", label: "Refunded" },
}

function formatCurrency(amount: number, currency = "USD") {
  // Locale-aware: "1.234,56 €" in de/es/fr/it, "€1,234.56" in en. Was pinned to
  // en-US, which printed US currency convention on a European product.
  return new Intl.NumberFormat(dateLocale(), { style: "currency", currency }).format(amount)
}

export default function InvoicesPage() {
  return (
    <PlanGate feature="invoicing">
      <InvoicesPageInner />
    </PlanGate>
  )
}

function InvoicesPageInner() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const router = useRouter()
  const queryClient = useQueryClient()
  const isAdmin = user?.role === "ADMIN"

  const [statusFilter, setStatusFilter] = useState("__all__")
  const [search, setSearch] = useState("")

  const { data, isLoading } = useQuery({
    queryKey: ["invoices", statusFilter],
    queryFn: () => invoicesApi.list({
      status: statusFilter !== "__all__" ? statusFilter : undefined,
      limit: 50,
    }),
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => invoicesApi.updateStatus(id, status),
    onSuccess: () => {
      notify.success(t("invoices.toast.statusUpdated"))
      queryClient.invalidateQueries({ queryKey: ["invoices"] })
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => invoicesApi.delete(id),
    onSuccess: () => {
      notify.success(t("invoices.toast.deleted"))
      queryClient.invalidateQueries({ queryKey: ["invoices"] })
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const invoices: Invoice[] = data?.data ?? []
  const filtered = search
    ? invoices.filter((inv) =>
        inv.invoiceNumber?.toLowerCase().includes(search.toLowerCase()) ||
        inv.clientName?.toLowerCase().includes(search.toLowerCase())
      )
    : invoices

  // Summary stats
  const totalDraft = invoices.filter((i) => i.status === "DRAFT").length
  const totalSent = invoices.filter((i) => i.status === "SENT").length
  const totalPaid = invoices.filter((i) => i.status === "PAID").length
  const totalOverdue = invoices.filter((i) => i.status === "OVERDUE").length
  const totalRevenue = invoices.filter((i) => i.status === "PAID").reduce((sum: number, i: Invoice) => sum + (i.total || 0), 0)
  const totalPending = invoices.filter((i) => i.status === "SENT").reduce((sum: number, i: Invoice) => sum + (i.total || 0), 0)

  return (
    <div className="min-h-full bg-background">
      <div className="p-8 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 data-tour="page-invoices" className="text-2xl font-semibold text-foreground">{t("invoices.title")}</h1>
            <p className="text-sm text-muted-foreground mt-1">{t("invoices.subtitle")}</p>
          </div>
          {isAdmin && (
            <Button size="sm" className="gap-1.5" onClick={() => router.push("/invoices/new")}>
              <Plus className="size-3.5" /> {t("invoices.newInvoice")}
            </Button>
          )}
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-card rounded-xl border border-border p-4">
            <p className="text-xs text-muted-foreground font-medium mb-1">{t("invoices.totalRevenue")}</p>
            <p className="text-xl font-bold text-foreground tabular-nums">{formatCurrency(totalRevenue)}</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-4">
            <p className="text-xs text-muted-foreground font-medium mb-1">{t("invoices.pending")}</p>
            <p className="text-xl font-bold text-foreground tabular-nums">{formatCurrency(totalPending)}</p>
            <p className="text-[11px] text-muted-foreground">{t("invoices.invoicesCount", { count: totalSent })}</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-4">
            <p className="text-xs text-muted-foreground font-medium mb-1">{t("invoices.paid")}</p>
            <p className="text-xl font-bold text-green-600 tabular-nums">{totalPaid}</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-4">
            <p className="text-xs text-muted-foreground font-medium mb-1">{t("invoices.overdue")}</p>
            <p className="text-xl font-bold text-red-600 tabular-nums">{totalOverdue}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("invoices.searchPlaceholder")}
              className="h-8 text-sm pl-8"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 text-sm w-[140px]">
              <SelectValue placeholder={t("common.status")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t("common.allStatuses")}</SelectItem>
              <SelectItem value="DRAFT">{t("invoices.statuses.draft")}</SelectItem>
              <SelectItem value="SENT">{t("invoices.statuses.sent")}</SelectItem>
              <SelectItem value="PAID">{t("invoices.statuses.paid")}</SelectItem>
              <SelectItem value="OVERDUE">{t("invoices.statuses.overdue")}</SelectItem>
              <SelectItem value="CANCELED">{t("invoices.statuses.canceled")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="grid grid-cols-[100px_1fr_120px_100px_100px_80px_40px] gap-3 px-4 py-2.5 bg-muted/30 text-[11px] font-medium text-muted-foreground uppercase tracking-wider border-b border-border/30">
            <div>{t("invoices.columns.invoiceNumber")}</div>
            <div>{t("invoices.columns.client")}</div>
            <div className="text-right">{t("invoices.columns.amount")}</div>
            <div>{t("invoices.columns.issueDate")}</div>
            <div>{t("invoices.columns.dueDate")}</div>
            <div>{t("invoices.columns.status")}</div>
            <div />
          </div>

          {isLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="size-10 mx-auto text-muted-foreground/20 mb-3" />
              <p className="text-sm text-muted-foreground">{t("invoices.empty")}</p>
              {isAdmin && <p className="text-xs text-muted-foreground/60 mt-1">{t("invoices.emptyHint")}</p>}
            </div>
          ) : (
            filtered.map((inv) => {
              const status = STATUS_STYLES[inv.status] || STATUS_STYLES.DRAFT!
              return (
                <div key={inv.id} onClick={() => router.push(`/invoices/${inv.id}`)} className="grid grid-cols-[100px_1fr_120px_100px_100px_80px_40px] gap-3 px-4 py-3 border-b border-border/20 last:border-0 hover:bg-muted/20 transition-colors items-center cursor-pointer">
                  <span className="text-sm font-mono font-medium text-foreground">{inv.invoiceNumber}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{inv.clientName}</p>
                    {inv.clientEmail && <p className="text-[11px] text-muted-foreground truncate">{inv.clientEmail}</p>}
                  </div>
                  <span className="text-sm font-semibold text-foreground text-right tabular-nums">{formatCurrency(inv.total, inv.currency)}</span>
                  <span className="text-xs text-muted-foreground">{new Date(inv.issueDate).toLocaleDateString(dateLocale(), { month: "short", day: "numeric" })}</span>
                  <span className="text-xs text-muted-foreground">{inv.dueDate ? new Date(inv.dueDate).toLocaleDateString(dateLocale(), { month: "short", day: "numeric" }) : "—"}</span>
                  <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full text-center", status.bg, status.text)}>{t(`invoices.statuses.${(inv.status || "DRAFT").toLowerCase()}`)}</span>
                  {isAdmin && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button onClick={(e) => e.stopPropagation()} className="size-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
                          <MoreHorizontal className="size-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenuItem onClick={() => router.push(`/invoices/${inv.id}`)}><Eye className="size-3.5 mr-2" /> {t("invoices.actions.view")}</DropdownMenuItem>
                        {inv.status === "DRAFT" && (
                          <DropdownMenuItem onClick={() => statusMutation.mutate({ id: inv.id, status: "SENT" })}>
                            <Send className="size-3.5 mr-2" /> {t("invoices.actions.send")}
                          </DropdownMenuItem>
                        )}
                        {inv.status === "SENT" && (
                          <DropdownMenuItem onClick={() => statusMutation.mutate({ id: inv.id, status: "PAID" })}>
                            <CheckCircle className="size-3.5 mr-2" /> {t("invoices.actions.markPaid")}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        {inv.status === "DRAFT" && (
                          <DropdownMenuItem className="text-red-600" onClick={() => deleteMutation.mutate(inv.id)}>
                            <XCircle className="size-3.5 mr-2" /> {t("common.delete")}
                          </DropdownMenuItem>
                        )}
                        {(inv.status === "SENT" || inv.status === "OVERDUE") && (
                          <DropdownMenuItem className="text-red-600" onClick={() => statusMutation.mutate({ id: inv.id, status: "CANCELED" })}>
                            <XCircle className="size-3.5 mr-2" /> {t("common.cancel")}
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
