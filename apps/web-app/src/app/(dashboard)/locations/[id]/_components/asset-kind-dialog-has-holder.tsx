"use client"

import { User } from "lucide-react"
import { KIND_SHAPE_LIMITS } from "@hbcfield/shared/client"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Row, Pick } from "./asset-kind-dialog-helpers"
import type { AssetKindDialogState } from "./use-asset-kind-dialog"

/** Part of AssetKindDialog's markup, moved here unchanged; it reads the page's state from `vm`. */
export function AssetKindDialogHasHolder({ vm }: { vm: AssetKindDialogState }) {
  const { t, shape, setHolder } = vm
  return (
    <div className="rounded-xl border border-border">
      <Row
        icon={User}
        title={t("assetKinds.hasHolder", "Someone can have it")}
        hint={t("assetKinds.hasHolderHint", "A member or a client is assigned to it — a resident, a driver, an operator.")}
        checked={shape.holder.enabled}
        onChange={(v) => setHolder({ enabled: v })}
        bare
      />
      {shape.holder.enabled && (
        <div className="space-y-3 border-t border-border p-3">
          <div>
            <Label className="text-xs text-muted-foreground">
              {t("assetKinds.holderLabel", "Call that person")}
            </Label>
            <Input
              className="mt-1"
              value={shape.holder.label}
              onChange={(e) => setHolder({ label: e.target.value })}
              placeholder={t("assetKinds.holderLabelPlaceholder", "Resident")}
              maxLength={KIND_SHAPE_LIMITS.maxHolderLabel}
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">
              {t("assetKinds.holderWho", "Who can be one")}
            </Label>
            <div className="mt-1.5 flex gap-2">
              <Pick
                label={t("assetKinds.members", "Members")}
                active={shape.holder.members}
                onClick={() => setHolder({ members: !shape.holder.members })}
              />
              <Pick
                label={t("assetKinds.clients", "Clients")}
                active={shape.holder.clients}
                onClick={() => setHolder({ clients: !shape.holder.clients })}
              />
            </div>
          </div>
          {/* Phrased against the switch above it — "Someone can have it",
              then "How many can have it". "How many at a time" read like a
              rate limit: it never said what was being counted.

              Two named choices rather than a toggle, because "just one"
              and "more than one" are both real answers; a switch labelled
              "multiple" makes its off state look like a decision nobody
              made. */}
          <div>
            <Label className="text-xs text-muted-foreground">
              {t("assetKinds.holderCount", "How many can have it")}
            </Label>
            <div className="mt-1.5 flex gap-2">
              <Pick
                label={t("assetKinds.holderOne", "Just one")}
                active={!shape.holder.multiple}
                onClick={() => setHolder({ multiple: false })}
              />
              <Pick
                label={t("assetKinds.holderSeveral", "More than one")}
                active={shape.holder.multiple}
                onClick={() => setHolder({ multiple: true })}
              />
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground/70">
              {shape.holder.multiple
                ? t("assetKinds.holderSeveralHint", "A shared flat, a shift of operators — records can list more than one.")
                : t("assetKinds.holderOneHint", "One van, one driver. Assigning someone new replaces whoever is there.")}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
