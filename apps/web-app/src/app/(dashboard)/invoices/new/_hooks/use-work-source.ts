"use client"

import { keys } from "@/lib/query-keys"
import { useState } from "react"
import { useSearchParams } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { useAuth } from "@/contexts/auth-context"
import { customersApi } from "@/lib/api"
import type { PeriodValue } from "@/components/ui/period-picker"
import { useActiveSpaces } from "@/hooks/use-space-directory"
import { fmtDate } from "../../_components/invoice-document"
import { useWorkGather } from "../_lib/use-work-gather"

/**
 * Where a new invoice's work comes from: a workspace, a client or nothing, over which period —
 * the choices offered for each, and the unbilled work that choice gathers.
 */
export function useWorkSource() {
  const { t } = useTranslation()
  const params = useSearchParams()
  const { user } = useAuth()
  const spaceIdFromUrl = params.get("spaceId") || undefined

  /*
    WHERE THE WORK COMES FROM — a choice, not a URL parameter.

    ⚠️ This screen could only ever bill a WORKSPACE, and only when something
    else had put `?spaceId=` in the address. Opening it from the Invoices page
    gave an empty form with no way to pull any work at all, and a company that
    bills a CLIENT whose jobs sit in three workspaces — or in none — could not
    produce that invoice here.

    Three sources, because all three are real: a workspace, a client, or nothing
    at all (a charge that was never a task).
  */
  const [source, setSource] = useState<"space" | "client" | "none">(spaceIdFromUrl ? "space" : "none")
  const [pickedSpaceId, setPickedSpaceId] = useState(spaceIdFromUrl ?? "")
  const [customerId, setCustomerId] = useState("")
  /** Type a client by hand, and offer to keep them. Only where there is a CRM. */
  const [addToCrm, setAddToCrm] = useState(false)

  /*
    THE SERVICE PERIOD — which work this invoice is for.

    ⚠️ Without one the screen pulled EVERY unbilled job for the client, ever. A
    company that invoices monthly could not bill August separately from
    September, and the first invoice anybody raised swept up work they had not
    meant to bill yet — silently, because an invoice full of real jobs looks
    correct.

    Blank means "everything outstanding", which is the right answer for a
    one-off and was the only answer before.
  */
  // Last month by default — what an invoice raised on the 1st is nearly always for.
  const [periodValue, setPeriodValue] = useState<PeriodValue>({ mode: "last", from: "", to: "" })

  const spaceId = source === "space" ? pickedSpaceId || undefined : undefined

  /*
    IS THERE A CRM? Answered from the session, so it costs no request and cannot
    disagree with the navigation — and it needs no reload, because the answer
    arrives with the user.

    ⚠️ Absent and empty are different answers, exactly as the navbar has it: a
    session that predates `spaceModules` carries none at all, and reading that
    as "no workspace runs anything" would take the client picker away from
    people who had it a minute ago.
  */
  const hasCrm = user
    ? (user.spaceModules === undefined ? (user.orgModules ?? []) : user.spaceModules).includes("crm")
    : false

  /** The workspaces to choose from, only once somebody is choosing one. */
  const { data: activeSpaces = [] } = useActiveSpaces({ enabled: source === "space" })

  /*
    ⚠️ ONLY THE WORKSPACES THAT ARE CUSTOMERS.

    A workspace is one of three things — a project, your own company, or a
    customer you do work for — and only the last can be sent a bill. Offering
    the warehouse and the head office invited somebody to invoice their own
    depot, and the schema already says so: `contactName`, `contactEmail` and the
    per-space billable rate all exist on the CUSTOMER kind alone.

    The product agrees everywhere else: the Invoices tab on a workspace only
    appears when `kind === "CUSTOMER"`. This picker was the one place that did
    not. Archived spaces and the Remote bucket are out for the usual reasons —
    one is finished, the other is not a place.
  */
  const billableSpaces = activeSpaces.filter((sp) => sp.kind === "CUSTOMER" && sp.isActive !== false && !sp.isRemote)

  /*
    The client list, and — from the same response — whether this person may
    CREATE one. `crmCaps` is the server's own answer, so the "also add them"
    offer cannot appear for somebody the server would refuse.
  */
  const { data: clientPage } = useQuery({
    queryKey: keys.customers.list({ limit: 200, contacts: "exclude", status: "active" }),
    queryFn: () => customersApi.list({ limit: 200, contacts: "exclude", status: "active" }),
    enabled: hasCrm,
    staleTime: 60_000,
  })
  const clients = clientPage?.data ?? []
  const mayAddClient = clientPage?.meta?.crmCaps?.manage === true || clientPage?.meta?.crmCaps?.editInfo === true

  const { gatherSource, gather, gatherLoading, workDays, periodFrom, periodTo } = useWorkGather({
    source,
    spaceId,
    customerId,
    periodValue,
  })

  /**
   * The period, as the client reads it on the document.
   *
   * ⚠️ An invoice that says "37.5h — €1,500" without saying WHICH DAYS cannot be
   * checked against anything on the client's side, and the question comes back
   * as an email a week later. Where a period was chosen, the document states it.
   */
  const periodLabel =
    periodFrom && periodTo
      ? `${fmtDate(periodFrom)} – ${fmtDate(periodTo)}`
      : periodFrom
        ? t("invoices.create.periodFromOnly", { from: fmtDate(periodFrom) })
        : periodTo
          ? t("invoices.create.periodToOnly", { to: fmtDate(periodTo) })
          : ""

  return {
    source,
    setSource,
    pickedSpaceId,
    setPickedSpaceId,
    customerId,
    setCustomerId,
    addToCrm,
    setAddToCrm,
    periodValue,
    setPeriodValue,
    spaceId,
    hasCrm,
    billableSpaces,
    clientPage,
    clients,
    mayAddClient,
    gatherSource,
    gather,
    gatherLoading,
    workDays,
    periodFrom,
    periodTo,
    periodLabel,
  }
}

/** The work source as the new-invoice page holds it. */
export type WorkSource = ReturnType<typeof useWorkSource>
