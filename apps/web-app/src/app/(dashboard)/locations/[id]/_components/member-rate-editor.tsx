"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Pencil } from "lucide-react"

import { rateHistoryApi, spaceMembersApi } from "@/lib/api"
import { useAuth } from "@/contexts/auth-context"
import { DatedRateField } from "@/components/rates/dated-rate"
import type { SpaceMember } from "@hbcfield/shared/client"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { formatMoney } from "@/lib/money"

/**
 * What this client pays for this person, per hour.
 *
 * ⚠️ THE FIRST VERSION PUT A LABEL, A FULL-WIDTH INPUT AND A SENTENCE OF HINT
 * UNDER EVERY MEMBER. On a roster of eight that is eight copies of "Blank
 * inherits. Set one only if this client pays differently for this person." and
 * eight empty boxes — roughly tripling each row, burying the things a person
 * came to that list for (who they are, their sub-role, where they live), and
 * repeating an ORGANISATION-level fact ("no rate set anywhere") once per
 * member as though it were about them.
 *
 * A rate is READ far more often than it is edited, and blank is the normal
 * state. So the resting form is a chip showing the number that applies, and
 * the editor opens on demand — the same shape as the Routing control beside
 * it, which is the page's own idiom for "a detail worth a click".
 *
 * ⚠️ The chip always shows a FIGURE where one exists, inherited or not. An
 * empty box with nothing beside it reads as "this person bills nothing here",
 * which is the one reading that must not happen on a screen about money.
 */

function useMoney(currency: string) {
  return (cents: number) => formatMoney(cents / 100, currency)
}

/**
 * The resting state: one chip, in the row's action group.
 *
 * Its own colour carries the whole distinction. A rate set HERE is the
 * exception and reads as one; an inherited rate is quiet, because it is the
 * normal case and nobody needs to act on it.
 */
export function MemberRateChip({
  member,
  open,
  onToggle,
  currency = "EUR",
}: {
  member: SpaceMember
  open: boolean
  onToggle: () => void
  currency?: string
}) {
  const { t } = useTranslation()
  const money = useMoney(currency)

  const own = member.billRateCents
  const inherited = member.inheritedBillRateCents
  const effective = own ?? inherited

  return (
    <Button
      variant={open ? "secondary" : "ghost"}
      size="sm"
      className={cn(
        "group h-8 gap-1.5 text-xs tabular-nums",
        // A rate set HERE is the exception and reads as one; an inherited rate
        // is quiet, because it is the normal case and needs no action.
        own != null && !open && "text-blue-600 dark:text-blue-400",
      )}
      onClick={onToggle}
      title={
        own != null
          ? t("scheduling.members.rateSetHere")
          : inherited != null
            ? t("scheduling.members.rateInherited")
            : t("scheduling.members.rateNone")
      }
    >
      {/*
        ⚠️ THE FIGURE IS THE CONTROL — no chevron.

        Asked for directly: "I need to see their rate and not open the dropdown
        on each one." A disclosure arrow says the answer is hidden behind a
        click, and on a roster of eight that is eight clicks to learn eight
        numbers somebody is scanning down a column for.

        So the number is simply there, and the pencil — which only appears on
        hover or focus — says it can also be changed.
      */}
      {effective != null ? (
        <>
          <span>{money(effective)}</span>
          <span className="text-[11px] font-normal opacity-60">/h</span>
        </>
      ) : (
        <span className="text-muted-foreground">{t("scheduling.members.rateSet")}</span>
      )}
      <Pencil
        className={cn(
          "h-3 w-3 transition-opacity",
          open ? "opacity-100" : "opacity-0 group-hover:opacity-60 group-focus-visible:opacity-60",
        )}
      />
    </Button>
  )
}

/**
 * The editor, opened from the chip: this member's rates HERE, each changed from
 * a day with its history — the same control as every other rate in the product.
 * The cost side only for people who may see what labour costs.
 */
export function MemberRateEditor({
  spaceId,
  member,
  currency = "EUR",
  onDone,
}: {
  spaceId: string
  member: SpaceMember
  currency?: string
  onDone?: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const money = useMoney(currency)
  const { user } = useAuth()
  const canViewLabourCost = (user as { canViewLabourCost?: boolean } | null)?.canViewLabourCost === true

  const { data: rates } = useQuery({
    queryKey: ["rate-history", "ASSIGNMENT", member.id],
    queryFn: () => rateHistoryApi.list({ target: "ASSIGNMENT", targetId: member.id, spaceId }),
  })
  const save = async (patch: { billRateCents?: number | null; costRateCents?: number | null }, from?: string) => {
    await spaceMembersApi.updateRate(spaceId, member.id, { ...patch, ...(from ? { effectiveFrom: from } : {}) })
    queryClient.invalidateQueries({ queryKey: ["space-members", spaceId] })
    queryClient.invalidateQueries({ queryKey: ["rate-history", "ASSIGNMENT", member.id] })
    onDone?.()
  }

  const inherited = member.inheritedBillRateCents
  return (
    <div className="mt-3 grid gap-4 rounded-lg border bg-muted/30 p-3 sm:grid-cols-2">
      <DatedRateField
        id={`bill-${member.id}`}
        label={t("rates.spaceBill")}
        hint={t("scheduling.members.rateSetHint")}
        currentCents={member.billRateCents ?? null}
        emptyLabel={inherited != null ? t("rates.usesDefault", { rate: money(inherited) }) : undefined}
        history={rates?.filter((r) => r.kind === "BILL_HOUR")}
        currency={currency}
        onSubmit={(c, from) => save({ billRateCents: c }, from)}
      />
      {canViewLabourCost && (
        <DatedRateField
          id={`cost-${member.id}`}
          label={t("rates.costHere")}
          hint={t("rates.spaceCostHint")}
          currentCents={member.costRateCents ?? null}
          history={rates?.filter((r) => r.kind === "COST_HOUR")}
          currency={currency}
          onSubmit={(c, from) => save({ costRateCents: c }, from)}
        />
      )}
    </div>
  )
}
