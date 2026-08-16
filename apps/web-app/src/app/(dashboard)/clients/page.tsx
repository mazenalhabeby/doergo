"use client"

/**
 * Member-facing CRM entry — "my clients". Unlike the per-space Customers tab
 * (which lives inside the managers-only space settings page), this is reachable
 * by any member whose role grants CRM access. The list is SERVER-scoped: a rep
 * sees only clients assigned to them; a manager role sees the whole book. Rows
 * open the shared client detail page (/customers/[id]), which enforces the same
 * ownership + caps.
 */
import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"
import { useQuery } from "@tanstack/react-query"
import { Contact, ChevronRight, Smartphone } from "lucide-react"

import { customersApi } from "@/lib/api"
import { customerStageLabel } from "@hbcfield/shared/client"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"

const initials = (n: string) => n.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()

export default function ClientsPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const [search, setSearch] = useState("")

  // No spaceId → org-wide; the server scopes to the caller's own clients (reps)
  // or the whole book (managers). portalResident:false → B2B CRM clients only.
  const listQ = useQuery({
    queryKey: ["my-clients", search],
    queryFn: () => customersApi.list({ portalResident: false, search: search || undefined, limit: 100 }),
  })
  const rows = listQ.data?.data ?? []
  const caps = listQ.data?.meta?.crmCaps

  return (
    <div className="mx-auto max-w-[1000px] px-6 py-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
            <Contact className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-lg font-semibold text-foreground">{t("nav.crm", "CRM")}</h1>
            <p className="text-xs text-muted-foreground">
              {caps?.view === "all"
                ? t("clients.subtitleAll", "Every client in the organization.")
                : t("clients.subtitleOwn", "Clients assigned to you.")}
            </p>
          </div>
        </div>
      </div>

      <Input
        placeholder={t("common.search", "Search…")}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-4 h-9 max-w-xs"
      />

      {listQ.isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}</div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-16 text-center">
          <Contact className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">{t("clients.empty", "No clients assigned to you yet.")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((c) => (
            <button
              key={c.id}
              onClick={() => router.push(`/customers/${c.id}`)}
              className="flex w-full items-center gap-3 rounded-xl border border-border p-3 text-left transition-colors hover:bg-muted/50"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-semibold text-muted-foreground">{initials(c.name)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">{c.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {[customerStageLabel(c.status || "LEAD"), c.contactName, c.phone || c.email].filter(Boolean).join(" · ")}
                </span>
              </span>
              {c.isPortalResident ? (
                <Badge className="gap-1 bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300">
                  <Smartphone className="h-3 w-3" /> {t("customers.appAccess", "App access")}
                </Badge>
              ) : (
                <Badge variant="secondary">{t("customers.crmTag", "CRM")}</Badge>
              )}
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
