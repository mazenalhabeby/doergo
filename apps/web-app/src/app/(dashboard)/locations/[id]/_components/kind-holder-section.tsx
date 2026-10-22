"use client"

import { useTranslation } from "react-i18next"
import { ChoiceChip } from "@/components/ui/choice-chip"
import { User } from "lucide-react"
import { KIND_SHAPE_LIMITS, type KindShape } from "@hbcfield/shared/client"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { KindOptionRow } from "./kind-option-row"

/** "Someone can have it": what that person is called, who may be one (members, clients) and how many at once. */
export function KindHolderSection({
  holder,
  setShape,
}: {
  holder: KindShape["holder"]
  setShape: React.Dispatch<React.SetStateAction<KindShape>>
}) {
  const { t } = useTranslation()
  const setHolder = (patch: Partial<KindShape["holder"]>) =>
    setShape((s) => ({ ...s, holder: { ...s.holder, ...patch } }))
  return (
    <div className="rounded-xl border border-border">
      <KindOptionRow
        icon={User}
        title={t("assetKinds.hasHolder", "Someone can have it")}
        hint={t(
          "assetKinds.hasHolderHint",
          "A member or a client is assigned to it — a resident, a driver, an operator.",
        )}
        checked={holder.enabled}
        onChange={(v) => setHolder({ enabled: v })}
        bare
      />
      {holder.enabled && (
        <div className="space-y-3 border-t border-border p-3">
          <div>
            <Label className="text-xs text-muted-foreground">{t("assetKinds.holderLabel", "Call that person")}</Label>
            <Input
              className="mt-1"
              value={holder.label}
              onChange={(e) => setHolder({ label: e.target.value })}
              placeholder={t("assetKinds.holderLabelPlaceholder", "Resident")}
              maxLength={KIND_SHAPE_LIMITS.maxHolderLabel}
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">{t("assetKinds.holderWho", "Who can be one")}</Label>
            <div className="mt-1.5 flex gap-2">
              <Pick
                label={t("assetKinds.members", "Members")}
                active={holder.members}
                onClick={() => setHolder({ members: !holder.members })}
              />
              <Pick
                label={t("assetKinds.clients", "Clients")}
                active={holder.clients}
                onClick={() => setHolder({ clients: !holder.clients })}
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
                active={!holder.multiple}
                onClick={() => setHolder({ multiple: false })}
              />
              <Pick
                label={t("assetKinds.holderSeveral", "More than one")}
                active={holder.multiple}
                onClick={() => setHolder({ multiple: true })}
              />
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground/70">
              {holder.multiple
                ? t(
                    "assetKinds.holderSeveralHint",
                    "A shared flat, a shift of operators — records can list more than one.",
                  )
                : t(
                    "assetKinds.holderOneHint",
                    "One van, one driver. Assigning someone new replaces whoever is there.",
                  )}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

/** A two-state chip — members, clients, or both. */
function Pick({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <ChoiceChip type="button" variant="iconPill" on={active} onClick={onClick}>
      {label}
    </ChoiceChip>
  )
}
