"use client"

import type { Dispatch, SetStateAction } from "react"
import { useTranslation } from "react-i18next"
import { useQueryClient } from "@tanstack/react-query"
import { keys } from "@/lib/query-keys"
import { CompanyField, companyName } from "@/components/companies/company-select"
import { DatedRateField, currentOf } from "@/components/rates/dated-rate"
import { employeesApi, type LegalEntity, type OrgMember, type rateHistoryApi } from "@/lib/api"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { todayKey } from "@hbcfield/shared/client"
import { PositionCombobox } from "./position-combobox"

/**
 * The profile box of the member editor: job title, employer, birthday,
 * employment, holiday and — for people who may see it — what they cost.
 * State lives in the dialog (it is what the save sends); this only renders it.
 */
export function EmploymentFields({
  member,
  orgUsesExternalWorkers,
  orgCurrency,
  canViewLabourCost,
  isExternalMember,
  mainCompany,
  usedPositions,
  memberRates,
  position,
  setPosition,
  employerEntityId,
  setEmployerEntityId,
  dateOfBirth,
  setDateOfBirth,
  employmentType,
  setEmploymentType,
  employmentStartDate,
  setEmploymentStartDate,
  leaveAllowance,
  setLeaveAllowance,
}: {
  member: OrgMember | null
  orgUsesExternalWorkers?: boolean
  orgCurrency?: string
  canViewLabourCost: boolean
  isExternalMember: boolean
  mainCompany: Pick<LegalEntity, "legalName" | "label"> | null | undefined
  usedPositions: string[]
  memberRates: Awaited<ReturnType<typeof rateHistoryApi.list>> | undefined
  position: string
  setPosition: (value: string) => void
  employerEntityId: string | null
  setEmployerEntityId: Dispatch<SetStateAction<string | null>>
  dateOfBirth: string
  setDateOfBirth: Dispatch<SetStateAction<string>>
  employmentType: string
  setEmploymentType: Dispatch<SetStateAction<string>>
  employmentStartDate: string
  setEmploymentStartDate: Dispatch<SetStateAction<string>>
  leaveAllowance: string
  setLeaveAllowance: Dispatch<SetStateAction<string>>
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  /*
    A cost lives on the PERSON and is read in several places: their profile,
    its dated history, and "Costs you" beside them in EVERY workspace they work
    in (["space-members", <space>]). Saving refreshes all of them — the
    workspace list otherwise kept the old figure for up to a minute.
  */
  const refreshMemberRates = () => {
    queryClient.invalidateQueries({ queryKey: keys.members.detail(member?.id) })
    queryClient.invalidateQueries({ queryKey: keys.rates.history("MEMBER", member?.id) })
    queryClient.invalidateQueries({ queryKey: keys.spaceMembers.all() })
    queryClient.invalidateQueries({ queryKey: keys.invoices.gather() })
  }
  return (
    <div className="space-y-2.5 rounded-lg border border-border/60 p-3">
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground">
          {t("members.memberEditor.jobTitle", "Job title")}
        </Label>
        <PositionCombobox value={position} onChange={setPosition} usedPositions={usedPositions} />
      </div>

      {/* The employer on their paperwork. Hidden while the organization has one company. */}
      <CompanyField
        id="member-employer"
        label={t("companies.employer")}
        help={t("companies.employerHelp")}
        value={employerEntityId}
        onChange={setEmployerEntityId}
        inheritLabel={t("companies.sameAsMain", { name: companyName(mainCompany) })}
      />

      {/*
        Date of birth.

        ⚠️ Sent as null rather than undefined when cleared: undefined
        means "leave alone", and a birthday entered by mistake could then
        never be removed.
      */}
      <div className="space-y-1.5">
        <Label htmlFor="member-dob" className="text-xs font-medium text-muted-foreground">
          {t("members.memberEditor.dateOfBirth", "Date of birth")}
        </Label>
        <Input
          id="member-dob"
          type="date"
          value={dateOfBirth}
          onChange={(e) => setDateOfBirth(e.target.value)}
          max={todayKey()}
          className="h-9 rounded-lg text-sm"
        />
      </div>

      {/* Employment type — only when the org distinguishes in-house vs external.
          (Capacity/"max daily jobs" is now derived automatically from throughput.) */}
      {orgUsesExternalWorkers && (
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">
            {t("technicians.detail.editDialog.employmentTypeLabel", "Employment type")}
          </Label>
          <Select value={employmentType} onValueChange={setEmploymentType}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="EXTERNAL">
                {t("technicians.detail.editDialog.employmentType.external", "External / freelancer")}
              </SelectItem>
              <SelectItem value="IN_HOUSE">
                {t("technicians.detail.editDialog.employmentType.inHouse", "In-house (employed)")}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {!isExternalMember && (
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">
            {t("members.memberEditor.startDateLabel")}
          </Label>
          <Input
            type="date"
            value={employmentStartDate}
            onChange={(e) => setEmploymentStartDate(e.target.value)}
            className="h-9"
          />
          <p className="text-[11px] text-muted-foreground">{t("members.memberEditor.startDateHint")}</p>
        </div>
      )}

      {!isExternalMember && (
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">
            {t("members.memberEditor.allowanceLabel")}
          </Label>
          <Input
            type="number"
            min={0}
            max={100}
            value={leaveAllowance}
            onChange={(e) => setLeaveAllowance(e.target.value)}
            placeholder={t("members.memberEditor.allowancePlaceholder")}
            className="h-9"
          />
          {/* Says what BLANK means. Without it an admin reads an empty box
            as "no holiday" and types a number they did not need to. */}
          <p className="text-[11px] text-muted-foreground">{t("members.memberEditor.allowanceHint")}</p>
        </div>
      )}

      {/*
        ⚠️ NOT FOR AN EXTERNAL MEMBER — they work for a client or a
        partner, not for us. We do not pay them, so there is no cost; the
        rest of this section already hides start date and holiday for
        exactly that reason, and an hourly cost describes the same
        employment we do not have with them.

        It sat OUTSIDE that guard and rendered for them, which is the
        mistake being fixed.
      */}
      {!isExternalMember && (
        <>
          {/*
        Their hourly rates — COST FIRST, and that order is the point.

        ⚠️ The bill rate led here at first and it read as "what this
        person charges", which is not what a member record is for. What
        belongs to a PERSON is what they cost you: Ahmed costs €20 an hour
        wherever he works. What the client pays is a fact about the
        CONTRACT and lives on the customer workspace — which is why the
        bill field below is usually blank and says so.

        The cost field is gated on `canViewLabourCost`; the bill field is
        not. What the work is worth is not a secret, and learning what the
        company PAYS for that hour should not be a side effect of being
        allowed to fix somebody's job title.
      */}
          {canViewLabourCost ? (
            <DatedRateField
              currency={orgCurrency}
              id="member-cost-rate"
              label={t("members.memberEditor.costRateLabel")}
              hint={t("members.memberEditor.costRateHint")}
              /* From the dated history, like the day rate below: the member object the
             page opened with may not carry the cost, and does not move when a new
             rate is saved — the field then read "Not set" next to its own history. */
              currentCents={
                memberRates?.some((r) => r.kind === "COST_HOUR")
                  ? currentOf(memberRates.filter((r) => r.kind === "COST_HOUR"))
                  : ((member as { costRateCents?: number | null } | null)?.costRateCents ?? null)
              }
              history={memberRates?.filter((r) => r.kind === "COST_HOUR")}
              onSubmit={async (c, from) => {
                await employeesApi.update(member!.id, {
                  costRateCents: c,
                  ...(from ? { rateEffectiveFrom: from } : {}),
                })
                refreshMemberRates()
              }}
            />
          ) : null}
          {canViewLabourCost ? (
            <DatedRateField
              currency={orgCurrency}
              id="member-day-cost"
              label={t("rates.dayCost")}
              hint={t("rates.dayCostHint")}
              unit="day"
              currentCents={currentOf(memberRates?.filter((r) => r.kind === "COST_DAY"))}
              history={memberRates?.filter((r) => r.kind === "COST_DAY")}
              onSubmit={async (c, from) => {
                await employeesApi.update(member!.id, { costDayCents: c, ...(from ? { rateEffectiveFrom: from } : {}) })
                refreshMemberRates()
              }}
            />
          ) : (
            /*
          ⚠️ Say it is hidden rather than simply omitting it. A person who
          expects a cost field and finds only a bill rate concludes the
          product has it the wrong way round — which is exactly what was
          reported. An absence explains nothing; this does.
        */
            <p className="text-[11px] text-muted-foreground">{t("members.memberEditor.costRateHidden")}</p>
          )}
        </>
      )}

      {/*
        ⚠️ NO BILL RATE HERE, and that is the correction.

        It was on this screen and read backwards, which is how it was
        reported. What somebody COSTS is a fact about the person and
        belongs on their record; what a CLIENT pays for their hour is a
        fact about that client — and the same engineer is routinely worth
        €45 at one customer and €60 at another. A single field on a person
        cannot say that.

        It lives on the assignment now: Workspaces → the customer →
        Members, where each person has a rate for THAT client, prefilled
        from what they would otherwise inherit.
      */}
    </div>
  )
}
