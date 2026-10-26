"use client"

import type { Dispatch, SetStateAction } from "react"
import { useTranslation } from "react-i18next"
import { Check, Loader2 } from "lucide-react"
import type { TimeOffRequest } from "@hbcfield/shared"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { isOneDayKind, type RequestKind, type RequestOptions } from "@/lib/requests"
import { RequestKindPicker } from "@/components/requests/request-kind"
import { RequestFields, type RequestFieldsValue } from "@/components/requests/request-fields"
import type { LeaveBalance } from "@/lib/api/types/employees"
import type { LeaveCountResult } from "@/lib/api/types/calendar"
import { REASON_TYPES, type ReasonKey } from "./reason-types"
import { Panel } from "@/components/page/page-kit"
import { RequestSummary } from "./request-summary"

/**
 * Writing the request: which kind, then leave's reason cards and note (or the other kind's own
 * fields), what the picked days come to, and Send.
 */
export function RequestForm({
  kinds,
  remoteSpaces,
  kind,
  chooseKind,
  fields,
  setFields,
  reasonType,
  setReasonType,
  notes,
  setNotes,
  rangeStart,
  rangeEnd,
  cost,
  dayCount,
  balance,
  problem,
  clash,
  canSubmit,
  onSend,
  sending,
  reset,
}: {
  kinds: RequestKind[]
  remoteSpaces: RequestOptions["remoteSpaces"]
  kind: RequestKind
  chooseKind: (next: RequestKind) => void
  fields: RequestFieldsValue
  setFields: Dispatch<SetStateAction<RequestFieldsValue>>
  reasonType: ReasonKey | null
  setReasonType: (reason: ReasonKey | null) => void
  notes: string
  setNotes: (notes: string) => void
  rangeStart: Date | null
  rangeEnd: Date | null
  cost: LeaveCountResult | undefined
  dayCount: number
  balance: LeaveBalance | null | undefined
  problem: string | null
  clash: TimeOffRequest | null
  canSubmit: boolean
  onSend: () => void
  sending: boolean
  reset: () => void
}) {
  const { t } = useTranslation()
  return (
    <Panel className="p-4 sm:p-5">
      {kinds.length > 1 && (
        <div className="mb-4 border-b border-border pb-4">
          <h2 className="mb-2.5 text-[15px] font-semibold text-foreground">{t("requests.form.kindQuestion")}</h2>
          <RequestKindPicker kinds={kinds} value={kind} onChange={chooseKind} />
        </div>
      )}
      {kind !== "LEAVE" ? (
        <RequestFields
          kind={kind}
          value={fields}
          onChange={(patch) => setFields((f) => ({ ...f, ...patch }))}
          remoteSpaces={remoteSpaces}
        />
      ) : (
        <>
          <h2 className="text-[15px] font-semibold text-foreground">{t("timeOff.my.stepReason")}</h2>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {REASON_TYPES.map(({ key, glyph: Glyph }) => {
              const active = reasonType === key
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setReasonType(active ? null : key)}
                  className={cn(
                    "group relative flex flex-col items-center gap-2 rounded-2xl border px-2 py-3.5 transition-all duration-200",
                    "motion-safe:hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active
                      ? "border-foreground bg-foreground text-background shadow-sm"
                      : "border-border text-muted-foreground hover:border-foreground/25 hover:text-foreground",
                  )}
                >
                  <Glyph
                    className={cn(
                      "size-6 stroke-current transition-transform duration-200",
                      active && "motion-safe:scale-110",
                    )}
                  />
                  <span className="text-[11px] font-medium leading-none">{t(`timeOff.reasonTypes.${key}`)}</span>
                </button>
              )
            })}
          </div>

          {/* Offered for every type: someone on vacation still wants to say
          "back Monday". Under "Other" it is the only identifying detail. */}
          <div
            className={cn(
              "grid transition-all duration-300 ease-out",
              reasonType ? "mt-3 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
            )}
          >
            <div className="overflow-hidden">
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={200}
                placeholder={
                  reasonType === "other" ? t("timeOff.my.notesRequiredPlaceholder") : t("timeOff.my.notesPlaceholder")
                }
                className={
                  "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm " +
                  "outline-none transition-colors placeholder:text-muted-foreground " +
                  "focus:border-primary"
                }
              />
            </div>
          </div>
        </>
      )}

      <RequestSummary
        rangeStart={rangeStart}
        rangeEnd={rangeEnd}
        kind={kind}
        cost={cost}
        dayCount={dayCount}
        reasonType={reasonType}
        balance={balance}
        problem={problem}
        clash={clash}
      />

      <div className="mt-4 flex items-center gap-2">
        <Button onClick={onSend} disabled={!canSubmit} size="pillLg" className="flex-1">
          {sending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Check className="mr-2 size-4" />}
          {t("requests.form.send")}
        </Button>
        {(reasonType || rangeStart || fields.reason) && (
          <Button variant="ghost" size="pill" onClick={reset} disabled={sending}>
            {t("common.clear", { defaultValue: "Clear" })}
          </Button>
        )}
      </div>
      {!rangeStart && (
        <p className="mt-2 text-center text-xs text-muted-foreground">
          {isOneDayKind(kind) ? t("requests.form.pickDayHint") : t("timeOff.my.pickDaysHint")}
        </p>
      )}
    </Panel>
  )
}
