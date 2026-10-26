"use client"

import { keys } from "@/lib/query-keys"
import { useMemo, useState } from "react"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"
import { useQueryClient } from "@tanstack/react-query"
import { Contact, Plus } from "lucide-react"

import { customersApi } from "@/lib/api"
import { cn } from "@/lib/utils"
import { ClientRowsSkeleton } from "@/components/skeletons/crm"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Panel } from "@/components/page/page-kit"
import { EmptyState } from "@/components/ui/empty-state"
import { CustomerForm } from "./customer-form"
import { useClients } from "@/hooks/use-clients"
import { CustomerRow } from "./customer-row"

// The add / edit dialog lives in customer-form.tsx; re-exported for the client record page.
export { CustomerForm }

/*
  "contacts" is a different KIND of filter from the other three.

  All / CRM only / App users select among clients the list already holds.
  Contacts asks the server for rows it deliberately withholds: a person who
  exists because they work at a company you deal with is not a client, so they
  are excluded by default — a firm with six contacts would otherwise turn one
  client into seven rows and bury the pipeline.
*/
type Filter = "all" | "companies" | "people" | "contacts" | "app"

/** The page's primary action: add a client to this workspace (or, on All, the one the form asks for). */
export function AddCustomerButton({ spaceId }: { spaceId?: string }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  return (
    <CustomerForm
      spaceId={spaceId}
      onSaved={() => qc.invalidateQueries({ queryKey: keys.customers.lists() })}
      trigger={
        <Button size="pillLg">
          <Plus /> {t("customers.add", "Add customer")}
        </Button>
      }
    />
  )
}

/** What the list is for, in one line — the page header's subtitle. */
export function CustomersIntro({ spaceId }: { spaceId?: string }) {
  const { t } = useTranslation()
  return spaceId
    ? t(
        "customers.intro",
        "People & companies for this workspace. Sales works them with tasks; invited ones also use the app.",
      )
    : t("customers.introAll", "Every client you can see. Sales works them with tasks; invited ones also use the app.")
}

/**
 * The clients list — one workspace's, or the organization's.
 *
 * Takes an id rather than the space object because `space.id` was the only
 * field it ever read, and an optional one because this same list is now the
 * body of the top-level Clients page: no workspace means the whole book, which
 * the API already supports.
 *
 * That top-level page used to be a SECOND copy of these rows — same avatar
 * square, same stage line, same App-access badge, same chevron into the client
 * record — and the two had already drifted apart in what they offered. One
 * component, two mounts.
 */
export function CustomersTab({ spaceId }: { spaceId?: string }) {
  const { t } = useTranslation()
  const router = useRouter()

  const [search, setSearch] = useState("")
  const debouncedSearch = useDebouncedValue(search, 300)
  const [filter, setFilter] = useState<Filter>("all")

  // The filter is IN the request, and so in the key: a different segment is a
  // different question, and the server answers each one — filtering a fetched
  // page in the browser would show twelve rows of a hundred and a total that
  // disagreed with them.
  const listParams: Parameters<typeof customersApi.list>[0] = {
    spaceId,
    // Contacts are withheld by default, so this asks for them rather than
    // filtering a result set they were never in.
    contacts: filter === "contacts" ? "only" : undefined,
    type: filter === "companies" ? "COMPANY" : filter === "people" ? "PERSON" : undefined,
    /*
          Org-wide means the CRM book, not every portal resident.

          A B2C organization can have thousands of residents; they are people
          with a login to a client portal, not clients being worked. Excluded in
          the QUERY rather than filtered after, so the request stays small — and
          the App-users filter below is hidden to match, since it would then
          select from nothing.
        */
    portalResident: spaceId ? undefined : false,
    search: debouncedSearch || undefined,
    limit: 100,
  }
  const listQ = useClients(listParams)
  const customers = listQ.data?.data ?? []
  // Only the App-users split is still done here: it is a property of the row
  // rather than a different question for the server.
  const rows = useMemo(() => customers.filter((c) => filter !== "app" || c.isPortalResident), [customers, filter])

  return (
    <div className="space-y-3.5">
      <div className="flex flex-wrap items-center gap-2.5">
        <label
          className={
            "flex h-[38px] w-full items-center gap-2 rounded-full border border-border bg-card px-3 " +
            "text-muted-foreground focus-within:ring-2 focus-within:ring-ring sm:w-[280px]"
          }
        >
          <Icon name="search" size={16} />
          <input
            type="search"
            placeholder={t("common.search", "Search…")}
            aria-label={t("common.search", "Search…")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
        </label>
        <div className="flex flex-wrap gap-1.5">
          {(
            (spaceId
              ? ["all", "companies", "people", "contacts", "app"]
              : ["all", "companies", "people", "contacts"]) as Filter[]
          ).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={cn(
                "inline-flex h-8 items-center rounded-full border px-3.5 text-[13px] font-medium transition-colors",
                filter === f
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {f === "all"
                ? t("customers.filter.all", "All")
                : f === "companies"
                  ? t("customers.filter.companies", "Companies")
                  : f === "people"
                    ? t("customers.filter.people", "People")
                    : f === "contacts"
                      ? t("customers.filter.contacts", "Contacts")
                      : t("customers.filter.app", "App users")}
            </button>
          ))}
        </div>
      </div>

      {listQ.isLoading ? (
        // The rows that are coming — the same ones the route skeleton draws.
        <ClientRowsSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState icon={Contact} title={t("customers.empty", "No customers yet")} />
      ) : (
        <Panel className="p-1.5">
          <div className="flex h-10 items-center px-3.5 text-xs font-medium text-muted-foreground">
            {t("customers.title", "Customers")}
            <span className="ml-1.5 tabular-nums">{rows.length}</span>
          </div>
          {rows.map((c) => (
            <CustomerRow key={c.id} c={c} onOpen={() => router.push(`/clients/${c.id}`)} />
          ))}
        </Panel>
      )}
    </div>
  )
}
