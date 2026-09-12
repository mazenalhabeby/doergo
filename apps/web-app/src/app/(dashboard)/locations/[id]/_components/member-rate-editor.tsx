"use client"

import { useEffect, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Copy, Check, Loader2 } from "lucide-react"

import { spaceMembersApi } from "@/lib/api"
import type { SpaceMember } from "@hbcfield/shared/client"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

/**
 * What this member is billed at, AT THIS CLIENT.
 *
 * ⚠️ THIS IS WHERE A CUSTOMER-FACING RATE BELONGS, and putting it on the member
 * record was the mistake — it was reported as reading backwards, correctly.
 *
 * What somebody COSTS is a fact about the person: Ahmed costs €20 an hour
 * wherever he works, so that lives on his record. What a CLIENT pays for his
 * hour is a fact about that client, and the same engineer is routinely worth
 * €45 at one customer and €60 at another. One field on the person cannot say
 * that, and asking an office to fork somebody's record per customer is worse
 * than not offering it at all.
 *
 * ⚠️ Blank is the normal state and inherits. The inherited figure is SHOWN
 * rather than merely implied — an empty box with no number beside it reads as
 * "this person bills nothing here", which is the one reading that must not
 * happen on a screen about money.
 *
 * The copy button exists because the common edit is "the usual rate, but a bit
 * different for this client": it puts the inherited number in the box so it can
 * be changed, instead of making somebody look it up on another screen and
 * retype it.
 */
export function MemberRateEditor({
  spaceId,
  member,
  currency = "EUR",
}: {
  spaceId: string
  member: SpaceMember
  currency?: string
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  /*
    Euros in the box, cents on the wire — that is what a person types and what
    money must be stored as. Empty string is "inherit", and is deliberately not
    the same as "0", which would be a real rate of nothing.
  */
  const toField = (cents?: number | null) => (cents == null ? "" : String(cents / 100))
  const [value, setValue] = useState(toField(member.billRateCents))

  // Re-seed when the row changes underneath — a refetch after somebody else's
  // edit must not leave a stale number in a box that looks saved.
  useEffect(() => { setValue(toField(member.billRateCents)) }, [member.billRateCents])

  const inherited = member.inheritedBillRateCents
  const dirty = value.trim() !== toField(member.billRateCents)

  const save = useMutation({
    mutationFn: () =>
      spaceMembersApi.updateRate(spaceId, member.id, {
        // ⚠️ Blank sends NULL, never 0. Null means inherit; 0 means this person
        // is billed nothing here, and nothing downstream could tell them apart.
        billRateCents: value.trim() === "" ? null : Math.round(Number(value) * 100),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["space-members", spaceId] })
      notify.success(t("scheduling.members.rateSaved", "Rate saved"))
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const money = (cents: number) => {
    try {
      return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100)
    } catch {
      return `${(cents / 100).toFixed(2)} ${currency}`
    }
  }

  return (
    <div className="mt-2 flex flex-wrap items-end gap-2">
      <div className="min-w-[9rem]">
        <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
          {t("scheduling.members.rateLabel", "Billed at, here (per hour)")}
        </label>
        <Input
          type="number"
          min={0}
          step="0.01"
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={
            inherited != null
              ? t("scheduling.members.rateInherits", { rate: money(inherited) })
              : t("scheduling.members.rateNone", "No rate set anywhere")
          }
          className="h-8 text-sm"
        />
      </div>

      {/*
        The common edit is "the usual rate, but different here". Copying the
        inherited figure in beats making somebody find it on another screen.
        Hidden when there is nothing to copy or it is already in the box.
      */}
      {inherited != null && value.trim() === "" && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 text-xs text-muted-foreground"
          onClick={() => setValue(String(inherited / 100))}
        >
          <Copy className="h-3.5 w-3.5" />
          {t("scheduling.members.copyRate", "Copy {{rate}}", { rate: money(inherited) })}
        </Button>
      )}

      {dirty && (
        <Button
          type="button"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          disabled={save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          {t("common.save", "Save")}
        </Button>
      )}

      <p className={cn("basis-full text-[11px] text-muted-foreground", dirty && "text-amber-600 dark:text-amber-500")}>
        {value.trim() === ""
          ? t("scheduling.members.rateBlankHint", "Blank inherits. Set one only if this client pays differently for this person.")
          : t("scheduling.members.rateSetHint", "This client is billed this rate for this person, whatever their usual one is.")}
      </p>
    </div>
  )
}
