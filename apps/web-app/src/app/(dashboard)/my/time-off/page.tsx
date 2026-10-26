"use client"

import { useTranslation } from "react-i18next"
import { PageNotice } from "@/components/ui/empty-note"
import { PageHeader } from "@/components/page/page-kit"
import { useMyRequests } from "./_hooks/use-my-requests"
import { useRequestForm } from "./_hooks/use-request-form"
import { AllowanceSummary } from "./_components/allowance-summary"
import { RequestCalendar } from "./_components/request-calendar"
import { RequestForm } from "./_components/request-form"
import { RequestHistory } from "./_components/request-history"

/*
  Requests — this page grew from "time off" into everything a member asks the
  person responsible for them: leave, a remote day, a changed day, overtime
  agreed in advance, anything else. The kind is chosen FIRST; leave keeps every
  part of the old form (reason cards, working-day cost, clash warning), the
  other kinds swap in their own few fields. Validity is asked of the shared
  parser, so the button refuses exactly what the server would.
*/
export default function MyTimeOffPage() {
  const { t } = useTranslation()
  const { user, canSee, options, today, isLoading, balance, yearLabel, refetch, list, booked, bookedLeave, stats } =
    useMyRequests()
  const form = useRequestForm({ userId: user?.id, options, today, refetch, bookedLeave })

  // After every hook — an early return above them changes the hook order between renders.
  if (!canSee) {
    return <PageNotice>{t("timeOff.my.noAccess")}</PageNotice>
  }

  return (
    <div>
      <PageHeader title={t("nav.timeOff")} subtitle={t("timeOff.my.subtitle")} />

      {/* The allowance, and what is actually left of it. */}
      <AllowanceSummary balance={balance} yearLabel={yearLabel} stats={stats} />

      <div className="grid gap-3.5 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* ── Calendar ─────────────────────────────────────────────── */}
        <RequestCalendar
          cursor={form.cursor}
          setCursor={form.setCursor}
          today={today}
          booked={booked}
          pickDay={form.pickDay}
          setHovered={form.setHovered}
          inRange={form.inRange}
          isEdge={form.isEdge}
          manyKinds={options.kinds.length > 1}
        />

        {/* ── Request ──────────────────────────────────────────────── */}
        <RequestForm
          kinds={options.kinds}
          remoteSpaces={options.remoteSpaces}
          kind={form.kind}
          chooseKind={form.chooseKind}
          fields={form.fields}
          setFields={form.setFields}
          reasonType={form.reasonType}
          setReasonType={form.setReasonType}
          notes={form.notes}
          setNotes={form.setNotes}
          rangeStart={form.rangeStart}
          rangeEnd={form.rangeEnd}
          cost={form.cost}
          dayCount={form.dayCount}
          balance={balance}
          problem={form.problem}
          clash={form.clash}
          canSubmit={form.canSubmit}
          onSend={() => form.createMut.mutate()}
          sending={form.createMut.isPending}
          reset={form.reset}
        />
      </div>

      {/* ── History ──────────────────────────────────────────────────── */}
      <RequestHistory isLoading={isLoading} list={list} manyKinds={options.kinds.length > 1} onChanged={refetch} />
    </div>
  )
}
