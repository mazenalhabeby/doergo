"use client"

import { useMemo, type Dispatch, type SetStateAction } from "react"
import { useTranslation } from "react-i18next"
import { ChevronDown, ShieldCheck } from "lucide-react"
import type { AccessDraft } from "@hbcfield/shared/client"
import { AccessFields } from "@/components/permissions/access-fields"
import { cn } from "@/lib/utils"

/** The invited member's access profile, collapsed to a one-line summary until opened. */
export function InviteAccessSection({
  isExternal,
  access,
  patchAccess,
  accessOpen,
  setAccessOpen,
}: {
  isExternal: boolean
  access: AccessDraft
  patchAccess: (p: Partial<AccessDraft>) => void
  accessOpen: boolean
  setAccessOpen: Dispatch<SetStateAction<boolean>>
}) {
  const { t } = useTranslation()
  const platformSummary = useMemo(() => {
    const key =
      access.platforms === "web"
        ? "accessBuilder.platforms.webOnly"
        : access.platforms === "mobile"
          ? "accessBuilder.platforms.mobileOnly"
          : "accessBuilder.platforms.both"
    return t(key)
  }, [access.platforms, t])
  return (
    <>
      {/* Access & permissions — pre-configured so the member's first screen
          already matches their final access. Collapsed by default with a
          sensible default; expand to fine-tune. */}
      <div className="rounded-lg border border-border">
        <button
          type="button"
          onClick={() => setAccessOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
        >
          <div className="flex items-center gap-2 min-w-0">
            <ShieldCheck className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                {t("invitations.inviteDialog.accessTitle", "Access & permissions")}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {platformSummary} ·{" "}
                {t("invitations.inviteDialog.accessFeatureCount", "{{count}} features", {
                  count: access.modules.length,
                })}
                {access.canManageUsers ? ` · ${t("accessBuilder.perms.manage.title")}` : ""}
              </p>
            </div>
          </div>
          <ChevronDown
            className={cn("h-4 w-4 text-muted-foreground shrink-0 transition-transform", accessOpen && "rotate-180")}
          />
        </button>
        {accessOpen && (
          <div className="border-t border-border px-3 py-4">
            <AccessFields
              value={access}
              onChange={patchAccess}
              allowAdmin={false}
              /* External: only what shapes their screens — where they log
                 in and which tabs they get. Their powers come from the role
                 they are given in a space, not from here. */
              external={isExternal}
            />
          </div>
        )}
      </div>
    </>
  )
}
