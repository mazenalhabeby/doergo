"use client"

import { useTranslation } from "react-i18next"
import { logKeyFrom, type KindLogDue, type KindLogField, type KindLogType } from "@hbcfield/shared/client"

/** TypeDetails's state and handlers — everything before its markup, moved here unchanged. */
export function useTypeDetails({ type, onChange }: Pick<{ type: KindLogType; onChange: (patch: Partial<KindLogType>) => void }, 'type' | 'onChange'>) {
  const { t } = useTranslation()

  const setField = (fi: number, patch: Partial<KindLogField>) =>
    onChange({ fields: type.fields.map((f, idx) => (idx === fi ? { ...f, ...patch } : f)) })
  const hasMoney = type.fields.some((f) => f.type === "money")
  const hasPhoto = type.fields.some((f) => f.type === "photo")
  const meters = type.fields.filter((f) => f.type === "number" && f.meter && f.label.trim())
  const due = type.due

  const setDue = (patch: Partial<KindLogDue> | null) =>
    onChange({
      due: patch === null ? null : {
        months: null, units: null, meterKey: null, leadDays: null, leadUnits: null,
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

  return {
    t,
    setField,
    hasMoney,
    hasPhoto,
    meters,
    due,
    setDue,
    pointAtMeter,
    num,
  }
}

/** What TypeDetails and its sections read. */
export type TypeDetailsState = ReturnType<typeof useTypeDetails>
