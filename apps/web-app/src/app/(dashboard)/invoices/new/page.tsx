"use client"

import { PlanGate } from "@/components/plan-gate"
import { useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { ArrowLeft, Plus, Trash2, Loader2, Clock, Package, FileText, ChevronDown, ChevronRight } from "lucide-react"

import { invoicesApi, locationsApi } from "@/lib/api"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"

interface PartEntry { name: string; partNumber?: string | null; quantity: number; unitCost: number }
interface WorkEntry {
  taskId: string
  taskTitle: string
  reportId?: string | null
  workerName?: string | null
  hours: number
  notes?: string | null
  completedAt?: string | null
  parts: PartEntry[]
  hasReport: boolean
  include: boolean
  includeParts: boolean
}
interface ManualLine { description: string; quantity: number; unitPrice: number }

function todayIso() { return new Date().toISOString().slice(0, 10) }
function money(n: number, currency: string) {
  try { return new Intl.NumberFormat("en-IE", { style: "currency", currency: currency || "EUR" }).format(n || 0) }
  catch { return `${(n || 0).toFixed(2)} ${currency}` }
}
function fmtDate(d?: string | null) {
  if (!d) return "—"
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? "—" : dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}
function initials(name?: string | null) {
  if (!name) return "?"
  return name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?"
}

export default function NewInvoicePage() {
  return (
    <PlanGate feature="invoicing">
      <NewInvoiceInner />
    </PlanGate>
  )
}

function NewInvoiceInner() {
  const { t } = useTranslation()
  const router = useRouter()
  const params = useSearchParams()
  const queryClient = useQueryClient()
  const spaceId = params.get("spaceId") || undefined

  const [clientName, setClientName] = useState("")
  const [clientEmail, setClientEmail] = useState("")
  const [clientAddress, setClientAddress] = useState("")
  const [currency, setCurrency] = useState("EUR")
  const [issueDate, setIssueDate] = useState(todayIso())
  const [dueDate, setDueDate] = useState("")
  const [taxPct, setTaxPct] = useState("20")
  const [discount, setDiscount] = useState("0")
  const [notes, setNotes] = useState("")
  const [rate, setRate] = useState("") // euros/hour applied to labor lines
  const [entries, setEntries] = useState<WorkEntry[]>([])
  const [manualLines, setManualLines] = useState<ManualLine[]>([])
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [seeded, setSeeded] = useState(false)

  // Space (for the client header + fallback prefill).
  const { data: space } = useQuery({
    queryKey: ["location", spaceId],
    queryFn: () => locationsApi.getById(spaceId!),
    enabled: !!spaceId,
  })

  // Dynamically load the customer's completed, unbilled work on open.
  const { data: gather, isLoading: gatherLoading } = useQuery({
    queryKey: ["invoice-gather", spaceId],
    queryFn: () => invoicesApi.gather(spaceId!),
    enabled: !!spaceId,
  })

  useEffect(() => {
    if (space && !seeded) {
      setClientName((p) => p || (space as any).contactName || (space as any).name || "")
      setClientEmail((p) => p || (space as any).contactEmail || "")
      setClientAddress((p) => p || (space as any).address || "")
    }
  }, [space, seeded])

  useEffect(() => {
    if (gather && !seeded) {
      const g = gather as any
      if (g.clientName) setClientName((p) => p || g.clientName)
      if (g.clientEmail) setClientEmail((p) => p || g.clientEmail)
      if (g.clientAddress) setClientAddress((p) => p || g.clientAddress)
      if (g.currency) setCurrency(g.currency)
      if (g.rate != null) setRate(String(g.rate))
      setEntries(
        (g.workEntries || []).map((w: any) => ({
          taskId: w.taskId,
          taskTitle: w.taskTitle,
          reportId: w.reportId,
          workerName: w.workerName,
          hours: w.hours ?? 0,
          notes: w.notes,
          completedAt: w.completedAt,
          parts: w.parts || [],
          hasReport: w.hasReport,
          include: true,
          includeParts: true,
        })),
      )
      setSeeded(true)
    }
  }, [gather, seeded])

  const rateNum = Number(rate) || 0

  const setEntry = (taskId: string, patch: Partial<WorkEntry>) =>
    setEntries((prev) => prev.map((e) => (e.taskId === taskId ? { ...e, ...patch } : e)))

  const entryLabor = (e: WorkEntry) => (e.include ? e.hours * rateNum : 0)
  const entryParts = (e: WorkEntry) => (e.include && e.includeParts ? e.parts.reduce((s, p) => s + p.quantity * p.unitCost, 0) : 0)

  const workSubtotal = useMemo(
    () => entries.reduce((s, e) => s + entryLabor(e) + entryParts(e), 0),
    [entries, rateNum],
  )
  const manualSubtotal = useMemo(
    () => manualLines.reduce((s, m) => s + (Number(m.quantity) || 0) * (Number(m.unitPrice) || 0), 0),
    [manualLines],
  )
  const subtotal = workSubtotal + manualSubtotal
  const taxAmount = subtotal * ((Number(taxPct) || 0) / 100)
  const total = subtotal + taxAmount - (Number(discount) || 0)

  // Live per-worker hours summary from the included entries.
  const workerSummary = useMemo(() => {
    const map = new Map<string, number>()
    for (const e of entries) {
      if (!e.include || !e.workerName || e.hours <= 0) continue
      map.set(e.workerName, Math.round(((map.get(e.workerName) || 0) + e.hours) * 100) / 100)
    }
    return Array.from(map.entries()).map(([name, hours]) => ({ name, hours })).sort((a, b) => b.hours - a.hours)
  }, [entries])
  const totalHours = workerSummary.reduce((s, w) => s + w.hours, 0)

  const addManual = () => setManualLines((p) => [...p, { description: "", quantity: 1, unitPrice: 0 }])
  const setManual = (i: number, patch: Partial<ManualLine>) => setManualLines((p) => p.map((m, idx) => (idx === i ? { ...m, ...patch } : m)))
  const removeManual = (i: number) => setManualLines((p) => p.filter((_, idx) => idx !== i))

  const createMutation = useMutation({
    mutationFn: () => {
      const items: any[] = []
      for (const e of entries) {
        if (!e.include) continue
        if (e.hours > 0 && rateNum > 0) {
          items.push({
            description: `${e.taskTitle}${e.workerName ? ` — ${e.workerName}` : ""} · ${e.hours}h`,
            quantity: e.hours,
            unitPrice: rateNum,
            taskId: e.taskId,
            reportId: e.reportId || undefined,
          })
        } else {
          // No tracked hours (or no rate) → a task line the admin can price by hand.
          items.push({
            description: `${e.taskTitle}${e.workerName ? ` — ${e.workerName}` : ""}`,
            quantity: 1,
            unitPrice: 0,
            taskId: e.taskId,
            reportId: e.reportId || undefined,
          })
        }
        if (e.includeParts) {
          for (const p of e.parts) {
            items.push({
              description: p.partNumber ? `${p.name} (${p.partNumber})` : p.name,
              quantity: p.quantity,
              unitPrice: p.unitCost,
              taskId: e.taskId,
              reportId: e.reportId || undefined,
            })
          }
        }
      }
      for (const m of manualLines) {
        if (!m.description.trim()) continue
        items.push({ description: m.description.trim(), quantity: Number(m.quantity) || 0, unitPrice: Number(m.unitPrice) || 0 })
      }
      return invoicesApi.create({
        spaceId,
        clientName: clientName.trim(),
        clientEmail: clientEmail.trim() || undefined,
        clientAddress: clientAddress.trim() || undefined,
        currency,
        taxRate: (Number(taxPct) || 0) / 100,
        discount: Number(discount) || 0,
        issueDate,
        dueDate: dueDate || undefined,
        notes: notes.trim() || undefined,
        items,
      })
    },
    onSuccess: (inv: any) => {
      notify.success(t("invoices.create.created"))
      queryClient.invalidateQueries({ queryKey: ["invoices"] })
      router.push(`/invoices/${inv.id}`)
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const includedCount = entries.filter((e) => e.include).length
  const canSave = clientName.trim().length > 0 && (includedCount > 0 || manualLines.some((m) => m.description.trim()))

  return (
    <div className="min-h-full bg-background">
      <div className="p-6 sm:p-8 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="size-8" onClick={() => router.back()}>
              <ArrowLeft className="size-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-semibold text-foreground">{t("invoices.create.title")}</h1>
              {space && <p className="text-sm text-muted-foreground mt-0.5">{t("invoices.create.forSpace", { name: (space as any).name })}</p>}
            </div>
          </div>
          <Button disabled={!canSave || createMutation.isPending} onClick={() => createMutation.mutate()}>
            {createMutation.isPending && <Loader2 className="size-4 mr-1.5 animate-spin" />}
            {t("invoices.create.saveDraft")}
          </Button>
        </div>

        {/* Client + meta */}
        <div className="bg-card rounded-2xl border border-border p-5 grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
          <div className="space-y-3">
            <div>
              <Label className="text-xs">{t("invoices.create.clientName")} *</Label>
              <Input value={clientName} onChange={(e) => setClientName(e.target.value)} className="h-9 mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">{t("invoices.create.clientEmail")}</Label>
                <Input value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} className="h-9 mt-1" />
              </div>
              <div>
                <Label className="text-xs">{t("invoices.create.clientAddress")}</Label>
                <Input value={clientAddress} onChange={(e) => setClientAddress(e.target.value)} className="h-9 mt-1" />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">{t("invoices.create.issueDate")}</Label>
              <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className="h-9 mt-1" />
            </div>
            <div>
              <Label className="text-xs">{t("invoices.create.dueDate")}</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="h-9 mt-1" />
            </div>
            <div>
              <Label className="text-xs">{t("invoices.create.rate")}</Label>
              <Input type="number" min={0} step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} className="h-9 mt-1" placeholder={t("invoices.create.ratePlaceholder")} />
            </div>
            <div>
              <Label className="text-xs">{t("invoices.create.currency")}</Label>
              <Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase().slice(0, 3))} className="h-9 mt-1" />
            </div>
          </div>
        </div>

        {/* Worker hours summary */}
        {spaceId && (totalHours > 0 || workerSummary.length > 0) && (
          <div className="bg-card rounded-2xl border border-border p-4 mb-5">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="size-4 text-brand-600" />
              <p className="text-sm font-medium text-foreground">{t("invoices.create.hoursByWorker")}</p>
              <span className="text-xs text-muted-foreground ml-auto">{t("invoices.create.totalHours", { hours: totalHours })}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {workerSummary.length === 0 ? (
                <span className="text-xs text-muted-foreground">{t("invoices.create.noHours")}</span>
              ) : workerSummary.map((w) => (
                <div key={w.name} className="flex items-center gap-2 rounded-full bg-muted/60 pl-1 pr-3 py-1">
                  <span className="size-6 rounded-full bg-brand-600/15 text-brand-700 dark:text-brand-300 text-[10px] font-semibold flex items-center justify-center">{initials(w.name)}</span>
                  <span className="text-xs font-medium text-foreground">{w.name}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{w.hours}h</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Billable work (system-sourced) */}
        {spaceId && (
          <div className="mb-5">
            <div className="flex items-center justify-between mb-2 px-1">
              <p className="text-sm font-semibold text-foreground">{t("invoices.create.billableWork")}</p>
              <span className="text-xs text-muted-foreground">{t("invoices.create.jobsSelected", { count: includedCount, total: entries.length })}</span>
            </div>

            {gatherLoading ? (
              <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</div>
            ) : entries.length === 0 ? (
              <div className="bg-card rounded-2xl border border-border text-center py-12">
                <FileText className="size-10 mx-auto text-muted-foreground/20 mb-3" />
                <p className="text-sm text-muted-foreground">{t("invoices.create.noWork")}</p>
                <p className="text-xs text-muted-foreground/60 mt-1">{t("invoices.create.noWorkHint")}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {entries.map((e) => {
                  const open = expanded[e.taskId]
                  const lineTotal = entryLabor(e) + entryParts(e)
                  return (
                    <div key={e.taskId} className={cn("bg-card rounded-xl border transition-colors", e.include ? "border-border" : "border-border/40 opacity-60")}>
                      <div className="flex items-start gap-3 p-4">
                        <Checkbox checked={e.include} onCheckedChange={(v) => setEntry(e.taskId, { include: !!v })} className="mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-medium text-foreground truncate">{e.taskTitle}</p>
                            <span className="text-sm font-semibold tabular-nums shrink-0">{money(lineTotal, currency)}</span>
                          </div>
                          {/* worker · hours · date chips */}
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              <span className="size-5 rounded-full bg-brand-600/15 text-brand-700 dark:text-brand-300 text-[9px] font-semibold flex items-center justify-center">{initials(e.workerName)}</span>
                              {e.workerName || t("invoices.create.unassignedWorker")}
                            </span>
                            <span className="inline-flex items-center gap-1"><Clock className="size-3" />
                              <input
                                type="number" min={0} step="0.25" value={e.hours}
                                onChange={(ev) => setEntry(e.taskId, { hours: Number(ev.target.value) })}
                                className="w-14 bg-transparent border-b border-dashed border-border focus:border-brand-600 outline-none text-xs tabular-nums text-foreground"
                              /> h × {money(rateNum, currency)}
                            </span>
                            <span>{fmtDate(e.completedAt)}</span>
                            {e.parts.length > 0 && <span className="inline-flex items-center gap-1"><Package className="size-3" /> {t("invoices.create.partsCount", { count: e.parts.length })}</span>}
                          </div>
                          {/* notes preview */}
                          {e.notes && <p className="text-xs text-muted-foreground/80 mt-1.5 line-clamp-2">{e.notes}</p>}
                          {/* expand for parts / full notes */}
                          {(e.parts.length > 0 || (e.notes && e.notes.length > 120)) && (
                            <button onClick={() => setExpanded((p) => ({ ...p, [e.taskId]: !open }))} className="mt-2 inline-flex items-center gap-1 text-[11px] text-brand-600 hover:underline">
                              {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                              {open ? t("invoices.create.hideDetails") : t("invoices.create.showDetails")}
                            </button>
                          )}
                          {open && (
                            <div className="mt-2 space-y-2">
                              {e.notes && <p className="text-xs text-muted-foreground whitespace-pre-line rounded-lg bg-muted/40 p-2.5">{e.notes}</p>}
                              {e.parts.length > 0 && (
                                <div className="rounded-lg border border-border/60 overflow-hidden">
                                  <div className="flex items-center justify-between px-3 py-1.5 bg-muted/30">
                                    <span className="text-[11px] font-medium text-muted-foreground">{t("invoices.create.parts")}</span>
                                    <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
                                      <Checkbox checked={e.includeParts} onCheckedChange={(v) => setEntry(e.taskId, { includeParts: !!v })} className="size-3.5" />
                                      {t("invoices.create.billParts")}
                                    </label>
                                  </div>
                                  {e.parts.map((p, i) => (
                                    <div key={i} className="flex items-center justify-between px-3 py-1.5 text-xs border-t border-border/40">
                                      <span className="text-foreground">{p.name}{p.partNumber ? ` (${p.partNumber})` : ""}</span>
                                      <span className="text-muted-foreground tabular-nums">{p.quantity} × {money(p.unitCost, currency)} = {money(p.quantity * p.unitCost, currency)}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Manual / extra lines */}
        <div className="bg-card rounded-2xl border border-border overflow-hidden mb-5">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/40">
            <p className="text-sm font-medium text-foreground">{t("invoices.create.extraLines")}</p>
            <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground h-7" onClick={addManual}>
              <Plus className="size-3.5" /> {t("invoices.create.addLine")}
            </Button>
          </div>
          {manualLines.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-5">{t("invoices.create.noExtraLines")}</p>
          ) : (
            manualLines.map((m, i) => (
              <div key={i} className="grid grid-cols-[1fr_70px_100px_100px_32px] gap-2 px-4 py-2 border-b border-border/20 items-center">
                <Input value={m.description} onChange={(e) => setManual(i, { description: e.target.value })} placeholder={t("invoices.create.descriptionPlaceholder")} className="h-8 text-sm" />
                <Input type="number" value={m.quantity} onChange={(e) => setManual(i, { quantity: Number(e.target.value) })} className="h-8 text-sm text-right" />
                <Input type="number" value={m.unitPrice} onChange={(e) => setManual(i, { unitPrice: Number(e.target.value) })} className="h-8 text-sm text-right" />
                <span className="text-sm text-right tabular-nums font-medium">{money((Number(m.quantity) || 0) * (Number(m.unitPrice) || 0), currency)}</span>
                <button onClick={() => removeManual(i)} className="size-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-red-600 hover:bg-red-500/10"><Trash2 className="size-3.5" /></button>
              </div>
            ))
          )}
        </div>

        {/* Totals + notes */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="bg-card rounded-2xl border border-border p-5">
            <Label className="text-xs">{t("invoices.create.notes")}</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} className="mt-1 resize-none" placeholder={t("invoices.create.notesPlaceholder")} />
          </div>
          <div className="bg-card rounded-2xl border border-border p-5 space-y-2">
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">{t("invoices.create.subtotal")}</span><span className="tabular-nums">{money(subtotal, currency)}</span></div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">{t("invoices.create.discount")}</span>
              <Input type="number" min={0} value={discount} onChange={(e) => setDiscount(e.target.value)} className="h-7 w-24 text-sm text-right" />
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">{t("invoices.create.taxRate")}</span>
              <div className="flex items-center gap-1">
                <Input type="number" min={0} value={taxPct} onChange={(e) => setTaxPct(e.target.value)} className="h-7 w-16 text-sm text-right" />
                <span className="text-muted-foreground text-xs">%</span>
              </div>
            </div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">{t("invoices.create.tax")}</span><span className="tabular-nums">{money(taxAmount, currency)}</span></div>
            <div className="flex justify-between text-base font-semibold pt-2 border-t border-border"><span>{t("invoices.create.total")}</span><span className="tabular-nums">{money(total, currency)}</span></div>
          </div>
        </div>

        {/* Bottom action */}
        <div className="flex justify-end gap-3 mt-6">
          <Button variant="outline" onClick={() => router.back()}>{t("common.cancel")}</Button>
          <Button disabled={!canSave || createMutation.isPending} onClick={() => createMutation.mutate()}>
            {createMutation.isPending && <Loader2 className="size-4 mr-1.5 animate-spin" />}
            {t("invoices.create.saveDraft")}
          </Button>
        </div>
      </div>
    </div>
  )
}
