"use client"

import { keys } from "@/lib/query-keys"
import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  ArrowLeft,
  Mail,
  Phone,
  Clock,
  Settings2,
  CheckCircle2,
  AlertTriangle,
  Bell,
} from "lucide-react"

import { customersApi, locationsApi, tasksApi } from "@/lib/api"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { CustomerForm } from "../../../../components/crm/customers-tab"
import { AddressesPanel } from "./_components/customer-addresses"
import { ContactsPanel, WorksAtPanel } from "./_components/customer-contacts"
import { ClientRecordSkeleton } from "@/components/skeletons/crm"
import { ManagersPanel } from "./_components/customer-managers"
import { clientRecordActions } from "@/lib/crm-record-actions"
import { customerRecordView } from "./_lib/customer-record-lib"
import { AboutPanel, RecordIdentity } from "./_components/customer-about"
import { Chip, Count, Notice, Panel as KitPanel } from "@/components/page/page-kit"
import { StatusPill, IconBtn } from "./_components/customer-record-bits"
import { Composer, QuickRemind } from "./_components/customer-composer"
import { Timeline } from "./_components/customer-timeline"
import { InviteCard } from "./_components/customer-invite-card"

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
    return (
      <div className="mx-auto max-w-6xl p-6 text-center text-muted-foreground">
        {t("customers.notFound", "Customer not found")}
      </div>
    )
  }

  const { openReminders, overdue, feed, staleDays, showNoNextStep, showStale, filtered } = customerRecordView(
    activityQ.data,
    tasksQ.data?.data,
    customer,
    tab,
  )
  const status = customer.status || "LEAD"
  /*
    What this member may do HERE — the caps the server sent with the record, read
    by the same rules it enforces (lib/crm-record-actions). Edit, the stage, the
    composer, managers and the app invite were offered to anybody who could open
    the record, and a read-only member pressed them into a refusal.
  */
  const can = clientRecordActions(customer.crmCaps, customer.isPortalResident)
  const isCompany = customer.type === "COMPANY"

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      {/* Back to wherever they came from — the member CRM list (/clients) or, for
          a space manager, the space's Customers tab. history.back handles both. */}
      <button
        onClick={() => router.back()}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> {t("common.back", "Back")}
      </button>

      {/* ── HEADER ── */}
      <KitPanel className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <RecordIdentity customer={customer} />
          {/* right: actions + status + edit */}
          <div className="flex flex-wrap items-center gap-2">
            {customer.phone && (
              <IconBtn icon={Phone} href={`tel:${customer.phone}`} label={t("customers.call", "Call")} />
            )}
            {customer.email && (
              <IconBtn icon={Mail} href={`mailto:${customer.email}`} label={t("customers.email", "Email")} />
            )}
            {customer.isPortalResident && !isCompany ? (
              <Chip tone="accent" className="h-10 px-3.5 text-sm">
                <CheckCircle2 className="size-4" /> {t("customers.activeCustomer", "Active customer")}
              </Chip>
            ) : (
              <StatusPill
                current={status}
                onSet={(s) => setStatus.mutate(s)}
                pending={setStatus.isPending}
                readOnly={!can.setStage}
              />
            )}
            {can.editInfo && (
              <CustomerForm
                existing={customer}
                onSaved={refresh}
                trigger={
                  <Button variant="outline" size="pill">
                    <Settings2 /> {t("common.edit", "Edit")}
                  </Button>
                }
              />
            )}
          </div>
        </div>
      </KitPanel>

      <div className="mt-4 grid gap-4 lg:grid-cols-[320px_1fr]">
        {/* ── LEFT: About panel ── */}
        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <AboutPanel customer={customer} />

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
          {isCompany ? (
            <ContactsPanel customer={customer} canEdit={can.editInfo} />
          ) : (
            <WorksAtPanel customer={customer} canEdit={can.editInfo} />
          )}

          {/* Sales managers — only while the customer is worked by sales (no app access). */}
          {!customer.isPortalResident && (
            <ManagersPanel
              customer={customer}
              ownerId={customer.ownerId ?? undefined}
              onChanged={refresh}
              canEdit={can.assignManagers}
            />
          )}

          <AddressesPanel
            customerId={id}
            spaceId={customer.spaceId ?? undefined}
            hasPortal={hasB2C}
            portalId={customer.portalId ?? undefined}
            isPortalResident={customer.isPortalResident}
          />

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
            <Notice tone="warn" className="mb-0 flex-wrap">
              <Bell className="h-4 w-4 shrink-0" />
              <span className="flex-1">
                {t("customers.nudgeNoNext", "No follow-up scheduled.")}
                {staleDays != null && staleDays > 0
                  ? ` ${t("customers.lastActivityDays", "Last activity {{d}}d ago.", { d: staleDays })}`
                  : ""}
              </span>
              {can.work && <QuickRemind customerId={id} onAdded={refresh} />}
            </Notice>
          )}
          {showStale && !showNoNextStep && (
            <div className="flex items-center gap-2.5 rounded-2xl bg-shell-chip px-4 py-3 text-sm text-muted-foreground">
              <Clock className="h-4 w-4 shrink-0" />{" "}
              {t("customers.nudgeStale", "No activity in {{d}} days — time to check in?", { d: staleDays })}
            </div>
          )}

          <div className="flex items-center gap-[22px] border-b border-border">
            {(
              [
                ["activity", t("customers.tabActivity", "Activity"), feed.length],
                ["notes", t("customers.tabNotes", "Notes"), null],
                ["reminders", t("customers.tabReminders", "Reminders"), openReminders.length || null],
              ] as const
            ).map(([key, label, count]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={cn(
                  "relative -mb-px flex h-[42px] items-center gap-1.5 text-[13.5px] transition-colors",
                  tab === key
                    ? "font-semibold text-foreground"
                    : "font-medium text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
                {count != null && <Count n={count} tone={key === "reminders" && overdue.length ? "crit" : "soft"} />}
                {tab === key && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-foreground" />}
              </button>
            ))}
          </div>

          {overdue.length > 0 && tab !== "reminders" && (
            <Notice tone="crit" className="mb-0 font-medium">
              <AlertTriangle /> {t("customers.overdueCount", "{{count}} overdue follow-up", { count: overdue.length })}
            </Notice>
          )}

          <Timeline
            customerId={id}
            loading={activityQ.isLoading}
            activities={filtered}
            empty={tab}
            onChanged={refresh}
            canWork={can.work}
          />
        </main>
      </div>
    </div>
  )
}
