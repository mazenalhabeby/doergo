"use client"

import { useEffect, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Copy, Check, Loader2, Pencil } from "lucide-react"

import { spaceMembersApi } from "@/lib/api"
import type { SpaceMember } from "@hbcfield/shared/client"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

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

/** Euros in the box, cents on the wire. */
const toField = (cents?: number | null) => (cents == null ? "" : String(cents / 100))

function useMoney(currency: string) {
  return (cents: number) => {
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency", currency, maximumFractionDigits: 2,
      }).format(cents / 100)
    } catch {
      return `${(cents / 100).toFixed(2)} ${currency}`
    }
  }
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

/** The editor, opened from the chip. */
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
      notify.success(t("scheduling.members.rateSaved"))
      onDone?.()
    },
    onError: (e: Error) => notify.error(e.message),
  })

  return (
    <div className="mt-3 rounded-lg border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="number"
          min={0}
          step="0.01"
          inputMode="decimal"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={inherited != null ? String(inherited / 100) : t("scheduling.members.rateSet")}
          className="h-8 w-28 text-sm tabular-nums"
        />

        {/*
          The common edit is "the usual rate, but different here". Copying the
          inherited figure in beats sending somebody to another screen to look
          it up and retype it. Hidden once there is anything in the box.
        */}
        {inherited != null && value.trim() === "" && (
          <Button
            type="button" variant="ghost" size="sm"
            className="h-8 gap-1.5 text-xs text-muted-foreground"
            onClick={() => setValue(String(inherited / 100))}
          >
            <Copy className="h-3.5 w-3.5" />
            {t("scheduling.members.copyRate", { rate: money(inherited) })}
          </Button>
        )}

        {value.trim() !== "" && (
          <Button
            type="button" variant="ghost" size="sm"
            className="h-8 text-xs text-muted-foreground"
            onClick={() => setValue("")}
          >
            {t("scheduling.members.rateClear")}
          </Button>
        )}

        {dirty && (
          <Button
            type="button" size="sm" className="h-8 gap-1.5 text-xs"
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            {t("common.save", "Save")}
          </Button>
        )}
      </div>

      {/* One line, and only while the editor is open — not eight copies down a roster. */}
      <p className="mt-2 text-[11px] text-muted-foreground">
        {value.trim() === ""
          ? inherited != null
            ? t("scheduling.members.rateBlankInherits", { rate: money(inherited) })
            : t("scheduling.members.rateBlankNone")
          : t("scheduling.members.rateSetHint")}
      </p>
    </div>
  )
}
