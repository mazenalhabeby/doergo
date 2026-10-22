"use client"

import { keys } from "@/lib/query-keys"
import { useMemo, useState } from "react"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Contact, Plus, Smartphone, ChevronRight, Building2 } from "lucide-react"

import { customersApi, type Customer } from "@/lib/api"
import { customerStageLabel, personInitials } from "@hbcfield/shared/client"
import { cn } from "@/lib/utils"
import { Truncated } from "@/components/common/truncated"
import { ClientRowsSkeleton } from "@/components/skeletons/crm"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogTrigger } from "@/components/ui/dialog"
import { SectionHeader, EmptyState } from "./section-header"
import { useCustomerForm } from "./use-customer-form"
import { CustomerFormEdit } from "./customer-form-edit"

/*
  "contacts" is a different KIND of filter from the other three.

  All / CRM only / App users select among clients the list already holds.
  Contacts asks the server for rows it deliberately withholds: a person who
  exists because they work at a company you deal with is not a client, so they
  are excluded by default — a firm with six contacts would otherwise turn one
  client into seven rows and bury the pipeline.
*/
type Filter = "all" | "companies" | "people" | "contacts" | "app"

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
  const qc = useQueryClient()
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
  const listQ = useQuery({
    queryKey: keys.customers.list(listParams),
    queryFn: () => customersApi.list(listParams),
  })
  const customers = listQ.data?.data ?? []
  // Only the App-users split is still done here: it is a property of the row
  // rather than a different question for the server.
  const rows = useMemo(
    () => customers.filter((c) => filter !== "app" || c.isPortalResident),
    [customers, filter],
  )
  const invalidate = () => qc.invalidateQueries({ queryKey: keys.customers.lists() })

  return (
    <div className="space-y-4">
      <SectionHeader
        icon={Contact}
        accent="blue"
        title={t("customers.title", "Customers")}
        description={
          spaceId
            ? t("customers.intro", "People & companies for this workspace. Sales works them with tasks; invited ones also use the app.")
            : t("customers.introAll", "Every client you can see. Sales works them with tasks; invited ones also use the app.")
        }
        action={<CustomerForm spaceId={spaceId} onSaved={invalidate} trigger={
          <Button size="sm"><Plus className="mr-1.5 h-4 w-4" /> {t("customers.add", "Add customer")}</Button>
        } />}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Input
          placeholder={t("common.search", "Search…")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 max-w-xs"
        />
        <div className="inline-flex flex-wrap rounded-lg bg-muted p-0.5">
          {((spaceId
            ? ["all", "companies", "people", "contacts", "app"]
            : ["all", "companies", "people", "contacts"]) as Filter[]).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={cn("rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                filter === f ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
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
        <div className="space-y-2">
          {rows.map((c) => {
            /*
              The subtitle, built once.

              It is truncated to the row's width, so the same string has to be
              available whole for the hover — computing it twice is how the
              tooltip ends up saying something the row does not.
            */
            const subtitle = [
              c.isContact
                ? c.contactOf
                  ? t("customers.contactAt", "Contact at {{name}}", { name: c.contactOf.name })
                  : t("customers.contactTag", "Contact")
                : customerStageLabel(c.status || "LEAD"),
              !c.isContact && c.contactOf ? t("customers.atCompany", "at {{name}}", { name: c.contactOf.name }) : null,
              /*
                Who to ring, by name — and the typed `contactName` only while
                there is nobody real to name instead. That old field is printed
                here and nowhere else, so a reader seeing "Lead · Klaus Berger"
                could open the client and never find Klaus.
              */
              c.primaryContact
                ? c.contactCount && c.contactCount > 1
                  ? `${c.primaryContact.name} +${c.contactCount - 1}`
                  : c.primaryContact.name
                : c.contactName,
              c.phone || c.email,
            ]
              .filter(Boolean)
              .join(" · ")
            return (
            <button key={c.id} onClick={() => router.push(`/clients/${c.id}`)}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl border border-border p-3 text-left transition-colors hover:bg-muted/50",
                // Dimmed: a contact is somebody else's person, sitting in a list
                // of your clients. Still readable, plainly not the same thing.
                c.isContact && "opacity-70",
              )}>
              {/*
                Square for a company, round for a person — the same shape
                language the client record's own header uses, so the two kinds
                are told apart before anybody reads a word.
              */}
              <span className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center bg-muted text-sm font-semibold text-muted-foreground",
                c.type === "COMPANY" ? "rounded-lg" : "rounded-full",
              )}>
                {c.type === "COMPANY" ? <Building2 className="h-4.5 w-4.5" /> : personInitials(c.name)}
              </span>
              <span className="min-w-0 flex-1">
                <Truncated text={c.name} className="text-sm font-medium text-foreground" />
                <Truncated text={subtitle} className="text-xs text-muted-foreground" side="bottom" />
              </span>
              {c.isPortalResident ? (
                <Badge className="gap-1 bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300">
                  <Smartphone className="h-3 w-3" /> {t("customers.appAccess", "App access")}
                </Badge>
              ) : c.isContact ? (
                <Badge variant="outline">{t("customers.contactTag", "Contact")}</Badge>
              ) : (
                <Badge variant="secondary">{t("customers.crmTag", "CRM")}</Badge>
              )}
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Add / edit dialog — exported for reuse on the full customer record page.
/**
 * ⚠️ A client belongs to a WORKSPACE, and this form is opened from two places
 * that know different amounts about which one.
 *
 * From a workspace's own Customers tab, `spaceId` is that workspace and there is
 * nothing to ask. From the top-level Clients page the reader may be on "All",
 * where `spaceId` is undefined — and that used to create a client belonging to
 * NO workspace: absent from every workspace tab, visible only under All, and
 * outside the per-workspace CRM everything else here is built on. Sixteen of
 * nineteen clients in this database arrived that way.
 *
 * So when nobody has said which workspace, the form asks. One workspace and it
 * answers itself; several and it is a required choice, because guessing puts a
 * client somewhere a person then has to find.
 *
 * On EDIT it shows the workspace too. Hiding it was a mistake: a client created
 * before this asked — sixteen of nineteen here — had no way out of "no
 * workspace" except a database statement, and a client filed in the wrong one
 * was stuck there. The field says what it does, because moving a client between
 * workspaces is not the same kind of act as correcting a phone number. An app
 * user is the exception: their workspace is decided by the portal that runs
 * their login, and the server refuses to move them.
 */
export function CustomerForm({ spaceId, existing, onSaved, trigger, personOnly }: {
  // personOnly = hide the Person/Company toggle and lock to Person (e.g. a
  // portal client / apartment resident is always a person).
  spaceId?: string; existing?: Customer; onSaved: (customer?: Customer) => void; trigger: React.ReactNode; personOnly?: boolean
}) {
  const vm = useCustomerForm({ spaceId, existing, onSaved, trigger, personOnly })
  const {
    t,
    user,
    open,
    setOpen,
    type,
    setType,
    form,
    details,
    setDetails,
    locale,
    setLocale,
    currency,
    setCurrency,
    legalEntityId,
    setLegalEntityId,
    mainCompany,
    needsSpace,
    showSpace,
    crmSpaces,
    chosenSpace,
    setChosenSpace,
    targetSpace,
    set,
    emailInvalid,
    isCompany,
    save,
  } = vm

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <CustomerFormEdit vm={vm} existing={existing} personOnly={personOnly} />
    </Dialog>
  )
}
