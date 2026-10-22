"use client"

import { useTranslation } from "react-i18next"
import { LOG_COLORS, logKeyFrom, type KindLogDue, type KindLogType } from "@hbcfield/shared/client"
import { LOG_COLOR_CLASSES } from "@/components/assets/log-style"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { LogTypeFields } from "./log-type-fields"

/** One log type opened up: its colour, who may log it, what an entry asks for, and when it comes due again. */
export function TypeDetails({
  type,
  onChange,
}: {
  type: KindLogType
  onChange: (patch: Partial<KindLogType>) => void
}) {
  const { t } = useTranslation()

  const meters = type.fields.filter((f) => f.type === "number" && f.meter && f.label.trim())
  const due = type.due

  const setDue = (patch: Partial<KindLogDue> | null) =>
    onChange({
      due:
        patch === null
          ? null
          : {
              months: null,
              units: null,
              meterKey: null,
              leadDays: null,
              leadUnits: null,
              ...(due ?? {}),
              ...patch,
            },
    })

  /**
   * Point the rule at a meter. An unsaved meter has no key yet, so it gets the
   * one its label would get — written in the SAME change as the rule, or the
   * second update would be applied over a copy that never had the key.
   */
  const pointAtMeter = (fi: number) => {
    const f = type.fields[fi]!
    let key = f.key
    if (!key) {
      const taken = new Set(type.fields.map((x) => x.key).filter(Boolean))
      key = logKeyFrom(f.label)
      for (let n = 2; taken.has(key); n++) key = `${logKeyFrom(f.label)}_${n}`
    }
    onChange({
      fields: type.fields.map((x, idx) => (idx === fi ? { ...x, key } : x)),
      due: { months: null, units: null, leadDays: null, leadUnits: null, ...(due ?? {}), meterKey: key },
    })
  }

  const num = (v: string): number | null => {
    const n = parseInt(v, 10)
    return Number.isFinite(n) && n > 0 ? n : null
  }

  return (
    <div className="space-y-3 border-t border-border/70 p-3">
      {/* Colour — a name from a fixed list, never a free value. */}
      <div>
        <Label className="text-[11px] text-muted-foreground">{t("assetLog.editor.color", "Colour")}</Label>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {LOG_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onChange({ color: c })}
              aria-label={c}
              className={cn(
                "h-6 w-6 rounded-full border-2 transition-transform",
                LOG_COLOR_CLASSES[c].dot,
                type.color === c ? "scale-110 border-foreground" : "border-transparent",
              )}
            />
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <FlagRow
          title={t("assetLog.editor.needsApproval", "Needs approval")}
          hint={t(
            "assetLog.editor.needsApprovalHint",
            "An entry from a member waits for somebody who manages assets, and counts " + "for nothing until then.",
          )}
          checked={type.needsApproval}
          onChange={(v) => onChange({ needsApproval: v })}
        />
        <FlagRow
          title={t("assetLog.editor.holderOnly", "Only whoever had it that day")}
          hint={t(
            "assetLog.editor.holderOnlyHint",
            "Off, anybody who can see it may log one — a colleague who noticed the dent.",
          )}
          checked={type.holderOnly}
          onChange={(v) => onChange({ holderOnly: v })}
        />
      </div>

      {/* Fields */}
      <LogTypeFields type={type} onChange={onChange} />

      {/* Next due */}
      <div className="rounded-md border border-border/70 p-2">
        <FlagRow
          title={t("assetLog.editor.due", "It comes due again")}
          hint={t(
            "assetLog.editor.dueHint",
            "After some months or a meter reading, whichever comes first. Holders and " +
              "whoever looks after it are reminded.",
          )}
          checked={!!due}
          onChange={(v) => setDue(v ? { months: 12, leadDays: 30 } : null)}
        />
        {due && (
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <div>
              <Label className="text-[11px] text-muted-foreground">
                {t("assetLog.editor.months", "Every … months")}
              </Label>
              <Input
                type="number"
                min={1}
                max={120}
                value={due.months ?? ""}
                onChange={(e) => setDue({ months: num(e.target.value) })}
                className="mt-1 h-8"
              />
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground">
                {t("assetLog.editor.leadDays", "Remind … days before")}
              </Label>
              <Input
                type="number"
                min={0}
                max={365}
                value={due.leadDays ?? ""}
                disabled={!due.months}
                onChange={(e) => setDue({ leadDays: num(e.target.value) })}
                className="mt-1 h-8"
              />
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground">{t("assetLog.editor.units", "Or every …")}</Label>
              <div className="mt-1 flex gap-1.5">
                <Input
                  type="number"
                  min={1}
                  value={due.units ?? ""}
                  disabled={meters.length === 0}
                  onChange={(e) => setDue({ units: num(e.target.value) })}
                  className="h-8"
                />
                <select
                  value={due.meterKey ?? ""}
                  disabled={meters.length === 0}
                  onChange={(e) => {
                    const fi = type.fields.findIndex((f, idx) => (f.key || `#${idx}`) === e.target.value)
                    if (fi < 0) return setDue({ meterKey: null, units: null, leadUnits: null })
                    pointAtMeter(fi)
                  }}
                  className="h-8 shrink-0 rounded-md border border-border bg-background px-1.5 text-xs text-foreground"
                >
                  <option value="">—</option>
                  {type.fields.map((f, idx) =>
                    f.type === "number" && f.meter && f.label.trim() ? (
                      <option key={idx} value={f.key || `#${idx}`}>
                        {f.unit || f.label}
                      </option>
                    ) : null,
                  )}
                </select>
              </div>
              {meters.length === 0 && (
                <p className="mt-1 text-[11px] text-muted-foreground/70">
                  {t("assetLog.editor.noMeter", "Add a number field marked as a counter reading to count in it.")}
                </p>
              )}
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground">
                {t("assetLog.editor.leadUnits", "Remind … before")}
              </Label>
              <Input
                type="number"
                min={0}
                value={due.leadUnits ?? ""}
                disabled={!due.units || !due.meterKey}
                onChange={(e) => setDue({ leadUnits: num(e.target.value) })}
                className="mt-1 h-8"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function FlagRow({
  title,
  hint,
  checked,
  onChange,
}: {
  title: string
  hint: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-foreground">{title}</p>
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  )
}
