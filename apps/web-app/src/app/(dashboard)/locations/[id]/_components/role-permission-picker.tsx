"use client"

import { useTranslation } from "react-i18next"
import { ACCESS_PERMISSION_SCHEMA, type AccessPermissionKey, type PermissionSet } from "@hbcfield/shared/client"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"

/*
  What a space role can grant — derived, not listed.

  This screen offered four attendance permissions, which is what a space role
  meant before the unified access model. It has meant more than that for a
  while: the server whitelists whatever ACCESS_PERMISSION_SCHEMA marks as
  grantable on a space, and resolveAccess honours all of them per space. So the
  other twelve — tasks, CRM, reports, assets, tracking, members — were storable
  and enforced, and simply could not be ticked.

  Derived from the same constant the server filters on, so the two cannot drift
  again: adding a permission to the catalogue with scopes ['org','space'] makes
  it appear here, and nowhere is there a second list to remember.
*/
export const SPACE_PERMISSIONS = ACCESS_PERMISSION_SCHEMA.filter((p) => p.scopes.includes("space"))

/** Grouped by domain, so twenty checkboxes read as five short subjects. */
const SPACE_PERMISSION_DOMAINS = [...new Set(SPACE_PERMISSIONS.map((p) => p.domain))]

/** What a management role grants in a workspace, one checkbox per permission, grouped by domain. */
export function RolePermissionPicker({
  permissions,
  togglePerm,
}: {
  permissions: PermissionSet
  togglePerm: (key: AccessPermissionKey) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="space-y-2">
      <Label>{t("scheduling.roles.fields.permissions")}</Label>
      <div className="space-y-4">
        {SPACE_PERMISSION_DOMAINS.map((domain) => (
          <div key={domain}>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t(`roles.domains.${domain}`, domain)}
            </p>
            <div className="space-y-1.5">
              {SPACE_PERMISSIONS.filter((p) => p.domain === domain).map((perm) => (
                <label
                  key={perm.key}
                  className="flex items-start gap-3 rounded-lg border p-2.5 cursor-pointer hover:bg-muted/40 transition-colors"
                >
                  <Checkbox
                    checked={permissions[perm.key] === true}
                    onCheckedChange={() => togglePerm(perm.key)}
                    className="mt-0.5"
                  />
                  <div className="min-w-0">
                    {/*
                      The catalogue's own label and description are the
                      fallback, so a newly added permission is readable
                      here the day it exists rather than rendering its key.
                    */}
                    <p className="text-sm font-medium text-foreground">
                      {t(`scheduling.roles.permissions.${perm.key}.label`, perm.label)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t(`scheduling.roles.permissions.${perm.key}.description`, perm.description)}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
