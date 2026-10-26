"use client"

import Link from "next/link"
import { useTranslation } from "react-i18next"

import type { customersApi, locationsApi } from "@/lib/api"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Combobox } from "@/components/ui/combobox"
import { PeriodPicker, type PeriodValue } from "@/components/ui/period-picker"

type Source = "space" | "client" | "none"
type Space = NonNullable<Awaited<ReturnType<typeof locationsApi.list>>>["data"][number]
type ClientPage = Awaited<ReturnType<typeof customersApi.list>>
type Client = ClientPage["data"][number]

/** Step 1, first half: where the work comes from, and over which days. */
export function WorkSourceFields({
  source,
  setSource,
  hasCrm,
  pickedSpaceId,
  setPickedSpaceId,
  billableSpaces,
  clientPage,
  clients,
  mayAddClient,
  customerId,
  setCustomerId,
  setAddToCrm,
  periodValue,
  setPeriodValue,
  workDays,
}: {
  source: Source
  setSource: (s: Source) => void
  hasCrm: boolean
  pickedSpaceId: string
  setPickedSpaceId: (id: string) => void
  billableSpaces: Space[]
  clientPage: ClientPage | undefined
  clients: Client[]
  mayAddClient: boolean
  customerId: string
  setCustomerId: (id: string) => void
  setAddToCrm: (v: boolean) => void
  periodValue: PeriodValue
  setPeriodValue: (v: PeriodValue) => void
  workDays: string[] | undefined
}) {
  const { t } = useTranslation()
  return (
    <>
      {/*
            ⚠️ STACKED, not wrapped. Three options of very different lengths in
            a flex-wrap put two on one row and the third alone underneath —
            which reads as two choices and an afterthought rather than as one
            choice of three. A column gives them equal weight and equal width.
          */}
      <div className="grid gap-1.5">
        {(
          [
            ["space", t("invoices.create.fromSpace")],
            ...(hasCrm ? [["client", t("invoices.create.fromClient")] as const] : []),
            ["none", t("invoices.create.fromNothing")],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setSource(key as typeof source)}
            className={cn(
              "h-[34px] rounded-full border px-3.5 text-[13px] transition-colors",
              source === key
                ? "border-foreground bg-foreground font-medium text-background"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {source === "space" && (
        <div className="mt-3">
          <Label className="text-xs">{t("invoices.create.workspace")}</Label>
          {/*
                    ⚠️ A COMBOBOX, not a <select>. A native select is a scroll
                    with no search — fine for three customer workspaces, useless
                    at thirty, and there is no moment where anybody notices it
                    became useless. It just gets slower every time a customer is
                    added.

                    The app already had this component, searchable and
                    result-capped; a second picker here would have been a second
                    set of keyboard behaviour to get right and keep right.
                  */}
          <Combobox
            value={pickedSpaceId}
            onChange={setPickedSpaceId}
            options={billableSpaces.map((sp) => ({
              value: sp.id,
              label: sp.name,
              // Searchable by address and contact too: people know a
              // site by where it is as often as by what it is called.
              keywords: [sp.address, sp.contactName].filter(Boolean).join(" "),
            }))}
            placeholder={t("invoices.create.choose")}
            searchPlaceholder={t("invoices.create.searchWorkspace")}
            className="mt-1"
          />
          {billableSpaces.length === 0 && (
            <p className="mt-1 text-xs text-muted-foreground">{t("invoices.create.noCustomerSpaces")}</p>
          )}
        </div>
      )}

      {source === "client" && (
        <div className="mt-3">
          <Label className="text-xs">{t("invoices.create.client")}</Label>
          {/*
                    ⚠️ This is the list that gets long. A real book of clients
                    runs to hundreds and the query caps at 200 — so without a
                    search box the two hundredth client is unreachable by
                    anything except scrolling, and nobody ever notices the
                    moment a native <select> stopped being usable. It just gets
                    slower every time a customer is added.

                    Matched on email and address as well as name: somebody
                    looking for a client they invoiced last year remembers the
                    town far more often than the exact registered name.
                  */}
          {/*
                    ⚠️ CRM ON, NO CLIENTS YET. An empty picker looks broken and
                    says nothing about what to do. Say so, and offer the two
                    ways forward: write the client in here (and, where this
                    person may, add them to the CRM in the same step), or go
                    to Clients.
                  */}
          {clientPage && clients.length === 0 ? (
            <div className="mt-1 rounded-lg border border-dashed border-border p-3">
              <p className="text-sm font-medium text-foreground">{t("invoices.create.noClientsYet")}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {mayAddClient ? t("invoices.create.noClientsHint") : t("invoices.create.noClientsAsk")}
              </p>
              <div className="mt-2.5 grid gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    setSource("none")
                    if (mayAddClient) setAddToCrm(true)
                  }}
                >
                  {t("invoices.create.noClientsWriteHere")}
                </Button>
                {mayAddClient && (
                  <Button type="button" size="sm" variant="outline" asChild>
                    <Link href="/clients">{t("invoices.create.noClientsOpen")}</Link>
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <Combobox
              value={customerId}
              onChange={setCustomerId}
              options={clients.map((c) => ({
                value: c.id,
                label: c.name,
                keywords: [c.email, c.address, c.phone].filter(Boolean).join(" "),
              }))}
              placeholder={t("invoices.create.choose")}
              searchPlaceholder={t("invoices.create.searchClient")}
              className="mt-1"
            />
          )}
          {/*
                    The client's details fill the header below, and stay editable —
                    an invoice sometimes goes to a different address than the one on
                    the record, and refusing that would send people back to the CRM
                    to edit a client in order to send one invoice.
                  */}
          <p className="mt-1 text-xs text-muted-foreground">{t("invoices.create.clientFillsHeader")}</p>
        </div>
      )}

      {source === "none" && <p className="mt-3 text-xs text-muted-foreground">{t("invoices.create.nothingHint")}</p>}

      {/*
                WHICH WORK — the service period.

                ⚠️ Presets first, because the answer is nearly always "last
                month". Somebody invoicing on the 1st should not have to reason
                about two dates to say the obvious thing, and a pair of empty
                calendars gives no clue a period was even expected.

                Blank stays legitimate: "everything outstanding" is right for a
                one-off, and is what this screen did before a period existed.
              */}
      {source !== "none" && (
        <div className="mt-4 border-t border-border pt-3">
          <Label className="text-xs">{t("invoices.create.period")}</Label>
          <PeriodPicker className="mt-2" value={periodValue} onChange={setPeriodValue} workDays={workDays} />
        </div>
      )}
    </>
  )
}
