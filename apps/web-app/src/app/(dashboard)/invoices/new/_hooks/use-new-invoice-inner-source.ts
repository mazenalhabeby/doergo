"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { useAuth } from "@/contexts/auth-context"
import type { LabourGrouping } from "@hbcfield/shared/client"
import { useInvoiceHeader } from "../../_components/use-invoice-header"
import type { PeriodValue } from "@/components/ui/period-picker"
import { todayIso, type WorkEntry } from "../_lib/draft-model"

/** useNewInvoiceInnerData's state and handlers — everything before its markup, moved here unchanged. */
export function useNewInvoiceInnerSource() {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const params = useSearchParams()
  const queryClient = useQueryClient()
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
    HOW THE LABOUR IS WRITTEN UP — the customer's preference, not ours.

    A managing agent wants the jobs. A staffing client wants the hours. Somebody
    presenting to a board wants a figure with the detail underneath it. All
    three describe the same work for the same money, so this is a choice about
    the document rather than about the price.
  */
  const [grouping, setGrouping] = useState<LabourGrouping>("task")
  /*
    Which face of the document is showing.

    ⚠️ Defaults to the WORKING view, not the client's copy. Somebody arriving
    here is building, not proofing, and opening on a finished-looking letterhead
    invites them to hunt for the controls that made it.
  */
  const [view, setView] = useState<"build" | "client">("build")

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

  const header = useInvoiceHeader({
    currency: user?.orgCurrency ?? "EUR",
    issueDate: todayIso(),
    taxPct: "20",
    discount: "0",
  })
  const {
    clientName,
    setClientName,
    clientEmail,
    setClientEmail,
    clientAddress,
    setClientAddress,
    currency,
    setCurrency,
    issueDate,
    setIssueDate,
    dueDate,
    setDueDate,
    taxPct,
    setTaxPct,
    discount,
    setDiscount,
  } = header
  // Where the currency came from (workspace → client → organization); cleared once somebody picks one.
  const [currencySource, setCurrencySource] = useState<"workspace" | "client" | "company" | "organization" | null>(null)
  // The company that issues it. null = automatic: the workspace's → the client's → the main one.
  const [legalEntityId, setLegalEntityId] = useState<string | null>(null)
  const [rate, setRate] = useState("") // euros/hour applied to labor lines
  const [entries, setEntries] = useState<WorkEntry[]>([])

  return {
    t,
    i18n,
    router,
    queryClient,
    user,
    source,
    setSource,
    pickedSpaceId,
    setPickedSpaceId,
    customerId,
    setCustomerId,
    addToCrm,
    setAddToCrm,
    grouping,
    setGrouping,
    view,
    setView,
    periodValue,
    setPeriodValue,
    spaceId,
    hasCrm,
    header,
    clientName,
    setClientName,
    clientEmail,
    setClientEmail,
    clientAddress,
    setClientAddress,
    currency,
    setCurrency,
    issueDate,
    setIssueDate,
    dueDate,
    setDueDate,
    taxPct,
    setTaxPct,
    discount,
    setDiscount,
    currencySource,
    setCurrencySource,
    legalEntityId,
    setLegalEntityId,
    rate,
    setRate,
    entries,
    setEntries,
  }
}
