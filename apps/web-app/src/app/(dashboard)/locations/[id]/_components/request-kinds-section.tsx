"use client"

import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Inbox } from "lucide-react"

import { keys } from "@/lib/query-keys"
import { notify } from "@/lib/toast"
import { locationsApi } from "@/lib/api"
import { serverErrorMessage } from "@/lib/server-error"
import { REQUEST_KINDS, requestKindHintKey, requestKindLabelKey, requestKindsEnabled, toggleRequestKind } from "@/lib/requests"
import { REQUEST_KIND_ICON } from "@/components/requests/request-kind"
import { Switch } from "@/components/ui/switch"
import { SectionHeader } from "../../../../../components/common/section-header"

/**
 * "Requests members can send here" — one switch per kind, saved at once (the
 * same pattern as the no-shift section above it).
 *
 * The stored list is EMPTY for "every kind", so a workspace nobody configured
 * offers everything, and the rules for reading and writing that live in
 * `lib/requests` (`requestKindsEnabled` / `toggleRequestKind`). The last kind
 * left on cannot be switched off: an empty list would mean every kind again.
 * Remote is still offered only to people allowed to work away from a site — the
 * server applies that per person, on top of this list.
 */
export function RequestKindsSection({ space }: { space: { id: string; requestKinds?: string[] | null } }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const saved = space.requestKinds ?? []
  const [stored, setStored] = useState<string[]>(saved)

  // Follow the server when it changes underneath us (another admin, a refetch).
  const savedKey = saved.join(",")
  useEffect(() => setStored(savedKey ? savedKey.split(",") : []), [savedKey])

  const save = useMutation({
    mutationFn: (requestKinds: string[]) => locationsApi.update(space.id, { requestKinds }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.locations.detail(space.id) })
      qc.invalidateQueries({ queryKey: keys.locations.lists() })
      qc.invalidateQueries({ queryKey: keys.timeOff.myOptions(undefined).slice(0, 1) })
      notify.success(t("attendance.noShift.saved", "Saved"))
    },
    onError: (e: Error) => {
      notify.error(serverErrorMessage(e, t))
      setStored(savedKey ? savedKey.split(",") : [])
    },
  })

  const enabled = requestKindsEnabled(stored)

  const flip = (kind: (typeof REQUEST_KINDS)[number], on: boolean) => {
    const next = toggleRequestKind(stored, kind, on)
    if (!next || save.isPending) return
    setStored(next)
    save.mutate(next)
  }

  return (
    <div>
      <SectionHeader
        icon={Inbox}
        title={t("requests.settings.title")}
        description={t("requests.settings.subtitle")}
      />
      <div className="mt-3 overflow-hidden rounded-xl border border-border" style={{ maxWidth: 680 }}>
        {REQUEST_KINDS.map((k) => {
          const Icon = REQUEST_KIND_ICON[k]
          const on = enabled.includes(k)
          const last = on && enabled.length === 1
          return (
            <label
              key={k}
              className="flex cursor-pointer items-start gap-3 border-b border-border px-4 py-3 last:border-b-0 hover:bg-muted/30"
            >
              <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-foreground">{t(requestKindLabelKey(k))}</span>
                <span className="block text-xs text-muted-foreground">{t(requestKindHintKey(k))}</span>
              </span>
              <Switch
                checked={on}
                disabled={save.isPending || last}
                onCheckedChange={(v) => flip(k, v)}
                aria-label={t(requestKindLabelKey(k))}
              />
            </label>
          )
        })}
      </div>
      <p className="mt-2 text-xs leading-snug text-muted-foreground" style={{ maxWidth: 680 }}>
        {t("requests.settings.note")}
      </p>
    </div>
  )
}
