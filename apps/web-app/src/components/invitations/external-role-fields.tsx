"use client"

import dynamic from "next/dynamic"
import { useTranslation } from "react-i18next"
import type { AccessDraft, PermissionChoice } from "@hbcfield/shared/client"
import { type AccessRole } from "@/lib/api"
import { Label } from "@/components/ui/label"
import { Segmented } from "@/components/ui/segmented"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { ExternalMode } from "./use-create-invitation-dialog"

// Only an external invitation draws the builder — not loaded until one is.
const PermissionBuilder = dynamic(
  () => import("@/components/permissions/permission-builder").then((m) => m.PermissionBuilder),
  { loading: () => <Skeleton className="h-64 w-full" /> },
)

/**
 * What an outsider may do in the chosen workspace. Two ways: set it area by area (the permission
 * builder), or use an existing shared role.
 */
export function ExternalRoleFields({
  externalMode,
  setExternalMode,
  spaceRoles,
  email,
  externalChoice,
  setExternalChoice,
  builderModules,
  access,
  patchAccess,
  externalRoleId,
  setExternalRoleId,
}: {
  externalMode: ExternalMode
  setExternalMode: (mode: ExternalMode) => void
  spaceRoles: AccessRole[]
  email: string
  externalChoice: PermissionChoice
  setExternalChoice: (choice: PermissionChoice) => void
  builderModules: string[] | undefined
  access: AccessDraft
  patchAccess: (p: Partial<AccessDraft>) => void
  externalRoleId: string
  setExternalRoleId: (id: string) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <Segmented
        ariaLabel={t("invitations.inviteDialog.externalRoleLabel", "Role in this workspace")}
        value={externalMode}
        onChange={setExternalMode}
        options={[
          { value: "builder", label: t("permissionBuilder.invite.custom") },
          ...(spaceRoles.length > 0 ? [{ value: "role" as const, label: t("permissionBuilder.invite.useRole") }] : []),
        ]}
      />
      {externalMode === "builder" ? (
        <PermissionBuilder
          name={email.trim() || t("permissionBuilder.invite.name")}
          isExternal
          value={externalChoice}
          onChange={setExternalChoice}
          spaceModules={builderModules}
          platform={{ value: access.platforms, onChange: (platforms) => patchAccess({ platforms }) }}
        />
      ) : (
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">
            {t("invitations.inviteDialog.externalRoleLabel", "Role in this workspace")}
          </Label>
          <Select value={externalRoleId} onValueChange={setExternalRoleId}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">
                {t("invitations.inviteDialog.externalRoleDefault", "Default (External Supervisor)")}
              </SelectItem>
              {spaceRoles.map((r: AccessRole) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">
            {t(
              "invitations.inviteDialog.externalRoleHint",
              "An external member's access is this role, in this workspace only.",
            )}
          </p>
        </div>
      )}
    </div>
  )
}
