"use client"

import { ChevronDown, ShieldCheck } from "lucide-react"
import { AccessFields } from "@/components/access-fields"
import { cn } from "@/lib/utils"
import type { CreateInvitationDialogState } from "./use-create-invitation-dialog"

/** Part of the parent component's markup, moved here unchanged; it reads the state from `vm`. */
export function InviteAccessSection({ vm }: { vm: CreateInvitationDialogState }) {
  const { t, isExternal, access, patchAccess, setAccessOpen, platformSummary, accessOpen } = vm
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
