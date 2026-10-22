"use client"

import type { Dispatch, SetStateAction } from "react"
import { useTranslation } from "react-i18next"
import type { AccessDraft } from "@hbcfield/shared/client"
import { Label } from "@/components/ui/label"

/** Staff, or somebody else's: choosing external clears what an external member cannot have. */
export function InviteWhoField({
  isExternal,
  setIsExternal,
  setScheduleType,
  setAccess,
}: {
  isExternal: boolean
  setIsExternal: (value: boolean) => void
  setScheduleType: (value: string) => void
  setAccess: Dispatch<SetStateAction<AccessDraft>>
}) {
  const { t } = useTranslation()
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{t("members.invite.whoSection")}</Label>
      <div className="grid grid-cols-2 gap-2">
        {(
          [
            { value: false, label: t("members.invite.staffOption"), hint: t("members.invite.staffOptionHint") },
            { value: true, label: t("members.invite.externalOption"), hint: t("members.invite.externalOptionHint") },
          ] as const
        ).map((opt) => (
          <button
            key={String(opt.value)}
            type="button"
            onClick={() => {
              setIsExternal(opt.value)
              // Schedule is the one control that disappears for an
              // external member, so its value is cleared with it — what
              // the form stops showing, it stops sending. Access is NOT
              // touched: the panel is identical for both, so the
              // selections in it must be too.
              if (opt.value) {
                setScheduleType("NONE")
                /*
                  What the form stops showing, it stops sending.

                  The four hidden sections still hold whatever was set
                  before the switch, and an invitation carrying an org
                  role or remote clock-in for an external member would be
                  refused — or worse, quietly applied. Their space is a
                  single assignment, so the scope is 'own' by definition.
                */
                setAccess((cur) => ({
                  ...cur,
                  memberRoleId: null,
                  allowRemote: false,
                  spaceScope: "own",
                }))
              }
            }}
            aria-pressed={isExternal === opt.value}
            className={`rounded-lg border p-2.5 text-left transition-colors ${
              isExternal === opt.value
                ? "border-primary bg-primary/5 ring-1 ring-primary"
                : "border-border bg-muted/40 hover:bg-muted"
            }`}
          >
            <span className="block text-xs font-medium text-foreground">{opt.label}</span>
            <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{opt.hint}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
