"use client"

import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { Check, Info, Lock } from "lucide-react"

import {
  formatCents,
  switchAvailable,
  type AccessPlatform,
  type PermissionAreaId,
  type PermissionChoice,
  type PermissionPresetId,
} from "@hbcfield/shared/client"
import { cn } from "@/lib/utils"
import { Switch } from "@/components/ui/switch"
import { Segmented } from "@/components/ui/segmented"
import {
  PRESET_ORDER,
  areaModuleMissing,
  builderAreas,
  builderSwitches,
  presetChoice,
  presetOfChoice,
  seatFor,
  switchOn,
} from "@/lib/permission-builder"

/**
 * WHAT ONE PERSON MAY DO IN ONE WORKSPACE — the builder.
 *
 * One controlled component, used by the workspace's member panel and by the
 * external invitation. It holds no state of its own and saves nothing: it
 * renders a `PermissionChoice` (areas → a level each, plus on/off switches) and
 * hands back the next one. The caller sends `permissionsFromChoice(choice)`.
 *
 * Read top to bottom it answers the four questions an admin has:
 *   1. where do I start (a preset — Observer, Supervisor, Workspace manager);
 *   2. how far in each area (a level that includes every level below it);
 *   3. which separate trusts (switches — each greyed with its reason when its
 *      area is too low to mean anything);
 *   4. what will that be, in words, and what does it cost.
 *
 * ⚠️ The price follows the KEYS (`isObserverSeat`), never the preset's name,
 * exactly as billing reads it — choose Observer and then add one ability and
 * the line flips to the full seat.
 */

export interface PermissionBuilderProps {
  /** The person's first name or full name, for the summary heading. */
  name: string
  isExternal: boolean
  value: PermissionChoice
  onChange: (next: PermissionChoice) => void
  /** The workspace's modules; undefined while unknown (nothing greyed on a guess). */
  spaceModules?: readonly string[] | null
  /** Where they sign in. Omit to hide; no `onChange` = shown read-only. */
  platform?: { value: AccessPlatform; onChange?: (p: AccessPlatform) => void; pending?: boolean }
  disabled?: boolean
}

const PLATFORMS: AccessPlatform[] = ["web", "mobile", "both"]
const PLATFORM_LABEL: Record<AccessPlatform, string> = {
  web: "accessBuilder.platforms.webOnly",
  mobile: "accessBuilder.platforms.mobileOnly",
  both: "accessBuilder.platforms.both",
}

export function PermissionBuilder({ name, isExternal, value, onChange, spaceModules, platform, disabled }: PermissionBuilderProps) {
  const { t } = useTranslation()
  const areas = useMemo(() => builderAreas(isExternal), [isExternal])
  const switches = useMemo(() => builderSwitches(isExternal), [isExternal])
  const preset = presetOfChoice(value)
  const seat = seatFor(value, isExternal)

  const areaTitle = (id: PermissionAreaId) => t(`permissionBuilder.areas.${id}.title`)
  const levelLabel = (id: PermissionAreaId, level: string) => t(`permissionBuilder.areas.${id}.levels.${level}`)

  const setLevel = (id: PermissionAreaId, level: string) =>
    onChange({ ...value, levels: { ...value.levels, [id]: level } })
  const setSwitch = (id: keyof PermissionChoice["switches"], on: boolean) =>
    onChange({ ...value, switches: { ...value.switches, [id]: on } })
  const pickPreset = (id: PermissionPresetId) =>
    // Keys granted elsewhere (`extra`) are kept — a preset never silently drops them.
    onChange({ ...presetChoice(id, { isExternal, spaceModules }), extra: value.extra })

  const summary = [
    ...areas
      .filter((a) => (value.levels[a.id] ?? "none") !== "none" && !areaModuleMissing(a, spaceModules))
      .map((a) => t(`permissionBuilder.areas.${a.id}.summary.${value.levels[a.id]}`)),
    ...switches.filter((s) => switchOn(value, s)).map((s) => t(`permissionBuilder.switches.${s.id}.summary`)),
  ]

  const heading = "text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"

  return (
    <div className="space-y-5" data-testid="permission-builder">
      {/* 1 — where to start */}
      <div className="space-y-2">
        <p className={heading}>{t("permissionBuilder.startFrom")}</p>
        <div role="radiogroup" aria-label={t("permissionBuilder.startFrom")} className="grid grid-cols-2 gap-2">
          {[...PRESET_ORDER, null].map((id) => {
            const on = preset === id
            const presetSeat = id && isExternal ? seatFor(presetChoice(id, { isExternal, spaceModules }), true) : null
            return (
              <button
                key={id ?? "custom"}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={disabled || id === null}
                onClick={() => id && pickPreset(id)}
                className={cn(
                  "rounded-lg border p-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  on ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border bg-muted/40 hover:bg-muted",
                  id === null && !on && "cursor-default opacity-60 hover:bg-muted/40",
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-foreground">{t(`permissionBuilder.presets.${id ?? "custom"}.title`)}</span>
                  {presetSeat && (
                    <span className="text-[11px] tabular-nums text-muted-foreground">{formatCents(presetSeat.cents)}</span>
                  )}
                </span>
                <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                  {t(`permissionBuilder.presets.${id ?? "custom"}.hint`)}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* 2 — how far, area by area */}
      <div className="space-y-2">
        <p className={heading}>{t("permissionBuilder.areasTitle")}</p>
        <div className="divide-y rounded-xl border">
          {areas.map((area) => {
            const missing = areaModuleMissing(area, spaceModules)
            const current = value.levels[area.id] ?? "none"
            return (
              <div key={area.id} className={cn("space-y-1.5 px-3 py-2.5", missing && "opacity-60")} data-area={area.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-foreground">{areaTitle(area.id)}</span>
                  <Segmented
                    ariaLabel={areaTitle(area.id)}
                    value={missing ? "none" : current}
                    onChange={(level) => setLevel(area.id, level)}
                    disabled={disabled || missing}
                    options={area.levels.map((l) => ({ value: l.id, label: levelLabel(area.id, l.id) }))}
                  />
                </div>
                {missing && (
                  <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Lock className="h-3 w-3 shrink-0" />
                    {t("permissionBuilder.moduleOff", { module: t(`permissionBuilder.modules.${area.module}`) })}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* 3 — separate trusts */}
      {switches.length > 0 && (
        <div className="space-y-2">
          <p className={heading}>{t("permissionBuilder.switchesTitle")}</p>
          <div className="divide-y rounded-xl border">
            {switches.map((sw) => {
              const available = switchAvailable(sw, value.levels)
              const reason = !available && sw.requires
                ? t("permissionBuilder.needsLevel", {
                    area: areaTitle(sw.requires.area),
                    level: levelLabel(sw.requires.area, sw.requires.level),
                  })
                : null
              const id = `perm-switch-${sw.id}`
              return (
                <div key={sw.id} className="flex items-center justify-between gap-3 px-3 py-2.5" data-switch={sw.id}>
                  <span className="min-w-0">
                    <label htmlFor={id} className={cn("block text-sm", available ? "text-foreground" : "text-muted-foreground")}>
                      {t(`permissionBuilder.switches.${sw.id}.title`)}
                    </label>
                    {reason && <span className="block text-[11px] text-muted-foreground">{reason}</span>}
                  </span>
                  <Switch
                    id={id}
                    checked={switchOn(value, sw)}
                    disabled={disabled || !available}
                    onCheckedChange={(on) => setSwitch(sw.id, on)}
                  />
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Where they sign in */}
      {platform && (
        <div className="space-y-2">
          <p className={heading}>{t("permissionBuilder.platformTitle")}</p>
          {platform.onChange ? (
            <Segmented
              ariaLabel={t("permissionBuilder.platformTitle")}
              value={platform.value}
              onChange={(p) => platform.onChange?.(p)}
              disabled={disabled || platform.pending}
              options={PLATFORMS.map((p) => ({ value: p, label: t(PLATFORM_LABEL[p]) }))}
            />
          ) : (
            <p className="text-sm text-foreground">
              {t(PLATFORM_LABEL[platform.value])}
              <span className="block text-[11px] text-muted-foreground">{t("permissionBuilder.platformReadOnly")}</span>
            </p>
          )}
        </div>
      )}

      {/* 4 — in words, and what it costs */}
      <div className="space-y-2 rounded-xl border bg-muted/30 px-3 py-3">
        <p className="text-xs font-semibold text-foreground">{t("permissionBuilder.summaryTitle", { name })}</p>
        {summary.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("permissionBuilder.summaryNothing")}</p>
        ) : (
          <ul className="space-y-1" data-testid="permission-summary">
            {summary.map((line) => (
              <li key={line} className="flex items-start gap-1.5 text-xs text-foreground">
                <Check className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                {line}
              </li>
            ))}
          </ul>
        )}
        {platform && <p className="text-xs text-muted-foreground">{t(`permissionBuilder.platformSummary.${platform.value}`)}</p>}
        {value.extra.length > 0 && (
          <p className="text-[11px] text-muted-foreground">{t("permissionBuilder.extraKept", { count: value.extra.length })}</p>
        )}
        {seat && (
          <p className="border-t pt-2 text-xs font-medium text-foreground" data-testid="permission-seat" data-seat={seat.kind}>
            {t(`permissionBuilder.seat.${seat.kind}`, { price: formatCents(seat.cents) })}
          </p>
        )}
      </div>

      {isExternal && (
        <p className="flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground">
          <Info className="mt-0.5 h-3 w-3 shrink-0" />
          {t("permissionBuilder.neverExternal")}
        </p>
      )}
    </div>
  )
}
