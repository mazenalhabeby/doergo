"use client"

import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Loader2, Users } from "lucide-react"

import { notify } from "@/lib/toast"
import { locationsApi } from "@/lib/api"
import { MIN_COVER_MAX } from "@hbcfield/shared/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SectionHeader } from "./section-header"

/**
 * The staffing floor for this workspace.
 *
 * ⚠️ 0 means NOT SET, and the copy has to say so. It is not "nobody needed":
 * with no floor the leave chart still shows how many people are left and simply
 * passes no judgement on the number. Every workspace that existed before this
 * setting sits at 0, which is why turning it on changed nothing for anyone.
 *
 * What it buys is a rule instead of a memory. Without it, approving leave means
 * a manager counting heads and deciding on the spot whether three is enough —
 * differently on a Tuesday than on a Friday, and differently from their
 * colleague. With it, the chart says "below your minimum" and everybody who
 * approves leave here applies the same standard.
 */
export function MinCoverSection({ space }: { space: { id: string; minCover?: number } }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const saved = space.minCover ?? 0
  const [value, setValue] = useState(String(saved))

  // Follow the server when it changes underneath us (another admin, a refetch).
  useEffect(() => setValue(String(saved)), [saved])

  const parsed = Number(value)
  const valid = Number.isInteger(parsed) && parsed >= 0 && parsed <= MIN_COVER_MAX
  const dirty = valid && parsed !== saved

  const save = useMutation({
    mutationFn: (next: number) => locationsApi.update(space.id, { minCover: next }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["location", space.id] })
      qc.invalidateQueries({ queryKey: ["locations"] })
      // The leave chart judges against this number, so it is stale the moment
      // the number moves.
      qc.invalidateQueries({ queryKey: ["cover-range"] })
      qc.invalidateQueries({ queryKey: ["orgTimeOff"] })
      qc.invalidateQueries({ queryKey: ["floor-now"] })
      notify.success(t("cover.minCover.saved", "Minimum cover saved"))
    },
    onError: (e: Error) => {
      notify.error(e.message)
      setValue(String(saved))
    },
  })

  return (
    <div>
      <SectionHeader
        icon={Users}
        title={t("cover.minCover.title", "Minimum cover")}
        description={t(
          "cover.minCover.description",
          "How many people must be on the floor here on a working day. Leave requests that would take this workspace below it are flagged before they are approved.",
        )}
      />

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          max={MIN_COVER_MAX}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="h-9 w-24 tabular-nums"
          aria-label={t("cover.minCover.title", "Minimum cover")}
        />
        <span className="text-sm text-muted-foreground">
          {saved === 0
            ? t("cover.minCover.unset", "No minimum set — the chart shows the count and judges nothing.")
            : t("cover.minCover.set", "people, every working day")}
        </span>
        {dirty && (
          <Button size="sm" onClick={() => save.mutate(parsed)} disabled={save.isPending}>
            {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {t("common.save")}
          </Button>
        )}
      </div>

      {!valid && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400">
          {t("cover.minCover.invalid", "Enter a whole number between 0 and {{max}}.", { max: MIN_COVER_MAX })}
        </p>
      )}
    </div>
  )
}
