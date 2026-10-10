"use client"

import { keys } from "@/lib/query-keys"
import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  ArrowLeft, Mail, Phone, Users, Clock, Settings2,
  Smartphone, CheckCircle2, AlertTriangle, Building2, Bell,
} from "lucide-react"

import { customersApi, locationsApi, tasksApi } from "@/lib/api"
import { personInitials } from "@hbcfield/shared/client"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { CustomerForm } from "../../locations/[id]/_components/customers-tab"
import { AddressesPanel } from "./customer-addresses"
import { ContactsPanel, WorksAtPanel } from "./customer-contacts"
import { ClientRecordSkeleton } from "@/components/skeletons/crm"
import { ManagersPanel } from "./customer-managers"
import { clientRecordActions } from "@/lib/crm-record-actions"
import { clientLocaleName } from "@/lib/client-locale"
import { type FeedItem, gradientFor, fmtDate } from "./customer-record-lib"
import { StatusPill, IconBtn, Panel, PanelHead, PropRow } from "./customer-record-bits"
import { Composer, QuickRemind } from "./customer-composer"
import { Timeline } from "./customer-timeline"
import { InviteCard } from "./customer-invite-card"

// ══════════════════════════════════════════════════════════════════════════════
export default function CustomerRecordPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const qc = useQueryClient()
  const [tab, setTab] = useState<"activity" | "notes" | "reminders">("activity")

  const customerQ = useQuery({ queryKey: keys.customers.detail(id), queryFn: () => customersApi.get(id) })
  const activityQ = useQuery({ queryKey: keys.customers.activities(id), queryFn: () => customersApi.activities(id) })
  const customer = customerQ.data
  const tasksQ = useQuery({
    queryKey: keys.customers.tasks(id),
    queryFn: () => tasksApi.list({ customerId: id, limit: 50 }),
    enabled: !!customer,
  })
  const spaceQ = useQuery({
    queryKey: keys.locations.detail(customer?.spaceId),
    queryFn: () => locationsApi.getById(customer!.spaceId!),
    enabled: !!customer?.spaceId,
  })
  const hasB2C = !!spaceQ.data?.enabledModules?.includes("b2c_portal")

  const refresh = () => {
    qc.invalidateQueries({ queryKey: keys.customers.detail(id) })
    qc.invalidateQueries({ queryKey: keys.customers.activities(id) })
    qc.invalidateQueries({ queryKey: keys.customers.tasks(id) })
  }
  const setStatus = useMutation({
    mutationFn: (status: string) => customersApi.update(id, { status }),
    onSuccess: refresh,
    onError: (e: Error) => notify.error(e.message || "Could not update status"),
  })

  // The same shape the auth check and the route loader draw — three moments,
  // one layout, so a reader cannot tell them apart.
  if (customerQ.isLoading) return <ClientRecordSkeleton />
  if (!customer) {
    return <div className="mx-auto max-w-6xl p-6 text-center text-muted-foreground">{t("customers.notFound", "Customer not found")}</div>
  }

  const activities = activityQ.data ?? []
  const tasks = tasksQ.data?.data ?? []
  const openReminders = activities.filter((a) => a.type === "REMINDER" && !a.doneAt)
  const overdue = openReminders.filter((a) => a.dueAt && new Date(a.dueAt).getTime() < Date.now())
  const status = customer.status || "LEAD"
  /*
    What this member may do HERE — the caps the server sent with the record, read
    by the same rules it enforces (lib/crm-record-actions). Edit, the stage, the
    composer, managers and the app invite were offered to anybody who could open
    the record, and a read-only member pressed them into a refusal.
  */
  const can = clientRecordActions(customer.crmCaps, customer.isPortalResident)
  const grad = gradientFor(customer.name)
  const isCompany = customer.type === "COMPANY"
  const website = customer.website
  const websiteHref = website ? (website.startsWith("http") ? website : `https://${website}`) : undefined

  // Unified feed: activities + this customer's tasks, newest first.
  const taskItems: FeedItem[] = tasks.map((tk) => ({
    id: `task-${tk.id}`,
    type: "TASK",
    createdAt: tk.createdAt,
    task: tk,
  }))
  const feed: FeedItem[] = [...activities, ...taskItems].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )

  // Smart nudges (only while sales works the customer — not an app customer).
  const lastAt = activities[0]?.createdAt ? new Date(activities[0].createdAt).getTime() : 0
  const staleDays = lastAt ? Math.floor((Date.now() - lastAt) / 86400000) : null
  const showNoNextStep = !customer.isPortalResident && openReminders.length === 0
  const showStale = !customer.isPortalResident && staleDays != null && staleDays >= 14

  const filtered = tab === "activity"
    ? feed
    : tab === "reminders"
      ? activities.filter((a) => a.type === "REMINDER")
      : activities.filter((a) => a.type === "NOTE")

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      {/* Back to wherever they came from — the member CRM list (/clients) or, for
          a space manager, the space's Customers tab. history.back handles both. */}
      <button onClick={() => router.back()}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {t("common.back", "Back")}
      </button>

      {/* ── HEADER ── */}
      <div className="rounded-2xl border border-border/70 bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* left: avatar + name (+ app access under) */}
          <div className="flex min-w-0 items-center gap-3">
            <span className={cn("flex h-14 w-14 shrink-0 items-center justify-center bg-gradient-to-br text-lg font-bold text-white shadow-sm",
              isCompany ? "rounded-xl" : "rounded-full", grad)}>
              {isCompany ? <Building2 className="h-6 w-6" /> : personInitials(customer.name)}
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold tracking-tight text-foreground sm:text-2xl">{customer.name}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                  {isCompany ? <><Building2 className="h-3 w-3" /> {t("customers.typeCompany", "Company")}</> : <><Users className="h-3 w-3" /> {t("customers.typePerson", "Person")}</>}
                </span>
                {customer.industry && <span className="text-[11px] text-muted-foreground">{customer.industry}</span>}
                {customer.isPortalResident && !isCompany && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                    <Smartphone className="h-3 w-3" /> {t("customers.appAccess", "App access")}
                  </span>
                )}
              </div>
            </div>
          </div>
          {/* right: actions + status + edit */}
          <div className="flex flex-wrap items-center gap-2">
            {customer.phone && <IconBtn icon={Phone} href={`tel:${customer.phone}`} label={t("customers.call", "Call")} />}
            {customer.email && <IconBtn icon={Mail} href={`mailto:${customer.email}`} label={t("customers.email", "Email")} />}
            {customer.isPortalResident && !isCompany ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" /> {t("customers.activeCustomer", "Active customer")}
              </span>
            ) : (
              <StatusPill current={status} onSet={(s) => setStatus.mutate(s)} pending={setStatus.isPending} readOnly={!can.setStage} />
            )}
            {can.editInfo && (
              <CustomerForm existing={customer} onSaved={refresh} trigger={
                <Button variant="outline" size="sm"><Settings2 className="mr-1.5 h-3.5 w-3.5" /> {t("common.edit", "Edit")}</Button>
              } />
            )}
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[300px_1fr]">
        {/* ── LEFT: About panel ── */}
        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <Panel>
            <PanelHead>{t("customers.about", "About")}</PanelHead>
            <dl className="divide-y divide-border/60 text-sm">
              <PropRow label={isCompany ? t("customers.companyEmail", "Company email") : t("customers.email", "Email")} value={customer.email} href={customer.email ? `mailto:${customer.email}` : undefined} />
              <PropRow label={isCompany ? t("customers.companyPhone", "Company phone") : t("customers.phone", "Phone")} value={customer.phone} href={customer.phone ? `tel:${customer.phone}` : undefined} />
              {isCompany && <>
                <PropRow label={t("customers.website", "Website")} value={website?.replace(/^https?:\/\//, "")} href={websiteHref} />
                <PropRow label={t("customers.legalName", "Legal name")} value={customer.legalName} />
                <PropRow label={t("customers.industry", "Industry")} value={customer.industry} />
                <PropRow label={t("customers.vatId", "VAT / UID")} value={customer.vatId} />
                <PropRow label={t("customers.regNumber", "Register no.")} value={customer.regNumber} />
              </>}
              {/* Always shown: "not set" still decides something, and the office should see what. */}
              <PropRow
                label={t("customers.locale", "Language for emails")}
                value={clientLocaleName(customer.locale) ?? t("customers.localeSame", "Same as the organization")}
              />
              {(customer.details ?? []).filter((d) => d.label && d.value).map((d, i) => (
                <PropRow key={i} label={d.label} value={d.value} />
              ))}
              <PropRow label={t("customers.added", "Added")} value={fmtDate(customer.createdAt)} />
            </dl>
            {customer.notes && <p className="mt-3 rounded-lg bg-muted/50 p-3 text-[13px] leading-relaxed text-muted-foreground">{customer.notes}</p>}
          </Panel>

          {/*
            Who you deal with there.

            Above Managers on purpose: these are the customer's people and those
            are ours, and the question "who do I ring?" is asked far more often
            than "who owns this account?".
          */}
          {/*
            One panel each, because they are one relationship read from its two
            ends: a company HAS contact people, a person WORKS AT companies.
            Showing both on the same record would invite somebody to make a
            client the contact of itself in two clicks.
          */}
          {isCompany
            ? <ContactsPanel customer={customer} canEdit={can.editInfo} />
            : <WorksAtPanel customer={customer} canEdit={can.editInfo} />}

          {/* Sales managers — only while the customer is worked by sales (no app access). */}
          {!customer.isPortalResident && <ManagersPanel customer={customer} ownerId={customer.ownerId ?? undefined} onChanged={refresh} canEdit={can.assignManagers} />}

          <AddressesPanel customerId={id} spaceId={customer.spaceId ?? undefined} hasPortal={hasB2C} portalId={customer.portalId ?? undefined} isPortalResident={customer.isPortalResident} />

          {/*
            App access is for a PERSON.

            The client portal is somewhere a human signs in — a tenant, a client
            contact. A company is not somebody who logs in, so offering to invite
            one is offering an action that cannot complete, and the card sat on
            every company record asking a question with no answer.
          */}
          {!isCompany && can.invite && <InviteCard customer={customer} hasB2C={hasB2C} onChanged={refresh} />}
        </aside>

        {/* ── MAIN: composer + tabs + timeline ── */}
        <main className="min-w-0 space-y-4">
          {can.work && <Composer customer={customer} onAdded={refresh} />}

          {/* Smart nudges — keep the relationship moving. */}
          {showNoNextStep && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
              <Bell className="h-4 w-4 shrink-0" />
              <span className="flex-1">{t("customers.nudgeNoNext", "No follow-up scheduled.")}{staleDays != null && staleDays > 0 ? ` ${t("customers.lastActivityDays", "Last activity {{d}}d ago.", { d: staleDays })}` : ""}</span>
              {can.work && <QuickRemind customerId={id} onAdded={refresh} />}
            </div>
          )}
          {showStale && !showNoNextStep && (
            <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-4 py-2.5 text-sm text-muted-foreground">
              <Clock className="h-4 w-4 shrink-0" /> {t("customers.nudgeStale", "No activity in {{d}} days — time to check in?", { d: staleDays })}
            </div>
          )}

          <div className="flex items-center gap-1 border-b border-border/70">
            {([
              ["activity", t("customers.tabActivity", "Activity"), feed.length],
              ["notes", t("customers.tabNotes", "Notes"), null],
              ["reminders", t("customers.tabReminders", "Reminders"), openReminders.length || null],
            ] as const).map(([key, label, count]) => (
              <button key={key} onClick={() => setTab(key)}
                className={cn("relative -mb-px flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors",
                  tab === key ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
                {label}
                {count != null && <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                  key === "reminders" && overdue.length ? "bg-red-100 text-red-600 dark:bg-red-950/50" : "bg-muted text-muted-foreground")}>{count}</span>}
                {tab === key && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary" />}
              </button>
            ))}
          </div>

          {overdue.length > 0 && tab !== "reminders" && (
            <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
              <AlertTriangle className="h-4 w-4" /> {t("customers.overdueCount", "{{count}} overdue follow-up", { count: overdue.length })}
            </div>
          )}

          <Timeline customerId={id} loading={activityQ.isLoading} activities={filtered} empty={tab} onChanged={refresh} canWork={can.work} />
        </main>
      </div>
    </div>
  )
}
