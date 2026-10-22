"use client"

import { useTranslation } from "react-i18next"
import { RailSection } from "../../../../../components/invoices/invoice-shell"
import { ClientFields, TermsFields, IssuedByField } from "../../_components/invoice-fields"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { WorkSourceFields } from "./work-source-fields"
import { LabourLayoutFields } from "./labour-layout-fields"
import { AddToCrmOption } from "./add-to-crm-option"
import type { NewInvoiceState } from "../_hooks/use-new-invoice"
import type { WorkSource } from "../_hooks/use-work-source"

/** The rail of the new-invoice page — where the work comes from, who it is for, the terms. */
export function NewInvoiceRail({
  work,
  header,
  entries,
  grouping,
  setGrouping,
  siteMode,
  anyWorkRole,
  groupByRole,
  setGroupByRole,
  lineStyle,
  setLineStyle,
  currencySource,
  setCurrencySource,
  exchange,
  legalEntityId,
  chooseCompany,
  autoCompanyId,
  rate,
  setRate,
}: { work: WorkSource } & Pick<
  NewInvoiceState,
  | "header"
  | "entries"
  | "grouping"
  | "setGrouping"
  | "siteMode"
  | "anyWorkRole"
  | "groupByRole"
  | "setGroupByRole"
  | "lineStyle"
  | "setLineStyle"
  | "currencySource"
  | "setCurrencySource"
  | "exchange"
  | "legalEntityId"
  | "chooseCompany"
  | "autoCompanyId"
  | "rate"
  | "setRate"
>) {
  const { t } = useTranslation()
  const {
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
    addToCrm,
    setAddToCrm,
    periodValue,
    setPeriodValue,
    workDays,
  } = work
  const {
    clientName,
    setClientName,
    clientEmail,
    setClientEmail,
    clientAddress,
    setClientAddress,
    issueDate,
    setIssueDate,
    dueDate,
    setDueDate,
    currency,
    setCurrency,
    taxPct,
    setTaxPct,
    discount,
    setDiscount,
  } = header
  return (
    <>
      {/* Where the work comes from */}
      <RailSection step={1} title={t("invoices.create.billFrom")}>
        <WorkSourceFields
          source={source}
          setSource={setSource}
          hasCrm={hasCrm}
          pickedSpaceId={pickedSpaceId}
          setPickedSpaceId={setPickedSpaceId}
          billableSpaces={billableSpaces}
          clientPage={clientPage}
          clients={clients}
          mayAddClient={mayAddClient}
          customerId={customerId}
          setCustomerId={setCustomerId}
          setAddToCrm={setAddToCrm}
          periodValue={periodValue}
          setPeriodValue={setPeriodValue}
          workDays={workDays}
        />
        <LabourLayoutFields
          entries={entries}
          grouping={grouping}
          setGrouping={setGrouping}
          siteMode={siteMode}
          anyWorkRole={anyWorkRole}
          groupByRole={groupByRole}
          setGroupByRole={setGroupByRole}
          lineStyle={lineStyle}
          setLineStyle={setLineStyle}
        />
      </RailSection>

      <RailSection step={2} title={t("invoices.create.clientSection")}>
        <ClientFields
          clientName={clientName}
          setClientName={setClientName}
          clientEmail={clientEmail}
          setClientEmail={setClientEmail}
          clientAddress={clientAddress}
          setClientAddress={setClientAddress}
          extra={
            /*
              Keep the client, when there is a CRM and a right to add to it.

              ⚠️ VISIBLE BEFORE IT IS USABLE, and that is the fix. It first
              appeared only once two characters had been typed, as muted
              text the size of a footnote, and did nothing until Save — so
              somebody filling in a client by hand had no way to know the
              option existed at all, which is exactly how it was reported.

              ⚠️ ONLY when the lines are being entered by hand, because
              that is the only case where the client is genuinely new to
              us. Picked FROM the CRM it is already there; gathered from a
              WORKSPACE that customer already exists as a workspace, and
              adding it again makes a second version of one relationship.

              And never without `crmCaps` — the server's own answer about
              who may create a client — so the offer cannot appear to
              somebody it would then refuse.
            */
            hasCrm && mayAddClient && source === "none" ? (
              <AddToCrmOption clientName={clientName} addToCrm={addToCrm} setAddToCrm={setAddToCrm} />
            ) : null
          }
        />
      </RailSection>

      {/*
        ⚠️ DATES, CURRENCY AND TAX ARE NOT "WHO IT IS FOR".

        They sat in that card because the old full-width layout had room
        for a second column and something had to fill it. In a rail that
        produced "Rate (per hour)" wrapped over three lines beside a
        currency box reading "EUF" — but the labels were only the symptom.
        A section called "who it is for" that also sets the hourly rate is
        a section somebody has to read twice to use once.
      */}
      <RailSection step={3} title={t("invoices.create.termsSection")}>
        <TermsFields
          issueDate={issueDate}
          setIssueDate={setIssueDate}
          dueDate={dueDate}
          setDueDate={setDueDate}
          currency={currency}
          setCurrency={(c) => {
            setCurrency(c)
            setCurrencySource(null)
          }}
          currencySource={currencySource}
          exchange={exchange}
          taxPct={taxPct}
          setTaxPct={setTaxPct}
          discount={discount}
          setDiscount={setDiscount}
        >
          <IssuedByField value={legalEntityId} onChange={chooseCompany} autoId={autoCompanyId} />
          {/*
            The fallback hourly rate — this screen's own term, because
            only this one derives lines from recorded hours. The edit
            screen corrects lines that already carry their rate, so it
            has nothing to apply a fallback to.
          */}
          <div>
            <Label className="text-xs">{t("invoices.create.rate")}</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              className="mt-1 h-9 tabular-nums"
              placeholder={t("invoices.create.ratePlaceholder")}
            />
            {/* Says what it is FOR. A bare "Rate" in an invoice form is
                ambiguous with every other rate on the page. */}
            <p className="mt-1 text-[11px] text-muted-foreground">{t("invoices.create.rateHint")}</p>
          </div>
        </TermsFields>
      </RailSection>
    </>
  )
}
