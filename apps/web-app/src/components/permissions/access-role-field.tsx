"use client"

import { useTranslation } from "react-i18next"
import type { AccessRole } from "@/lib/api"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Field } from "./access-field"
import type { AccessFieldsProps } from "./access-field-types"

// Selector values that are not a role id: "admin" (system) and "member" (no role).
const ADMIN = "__admin__"
const MEMBER = "__member__"

/*
  The Role selector, rendered on its own as well as at the top of the editor.

  An admin's Access tab replaced the WHOLE editor with a "full access,
  nothing to configure" note. True of permissions — an admin holds all of them
  — and false of the one control that is not a permission: the Role selector is
  how somebody stops being an admin, so hiding it meant an admin could never be
  demoted anywhere in the product.
*/
export function AccessRoleField({
  value,
  onChange,
  lockRole,
  allowAdmin,
  assignableRoles,
}: Pick<AccessFieldsProps, "value" | "onChange"> & {
  lockRole: boolean
  allowAdmin: boolean
  /** Org-wide roles a member can hold (Admin is its own top option). */
  assignableRoles: AccessRole[]
}) {
  const { t } = useTranslation()
  const roleValue = value.systemRole === "ADMIN" ? ADMIN : (value.memberRoleId ?? MEMBER)
  return (
    <Field dataTour="access-role" label={t("accessBuilder.orgRole", "Role")}>
      <Select
        value={roleValue}
        disabled={lockRole}
        onValueChange={(v) => {
          if (v === ADMIN) onChange({ systemRole: "ADMIN" })
          else if (v === MEMBER) onChange({ systemRole: "EMPLOYEE", memberRoleId: null })
          else onChange({ systemRole: "EMPLOYEE", memberRoleId: v })
        }}
      >
        <SelectTrigger className="h-9 w-full max-w-sm text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {allowAdmin && (
            <SelectItem value={ADMIN} className="text-sm">
              {t("members.roles.admin", "Admin")}
            </SelectItem>
          )}
          {assignableRoles.map((r) => (
            <SelectItem key={r.id} value={r.id} className="text-sm">
              {r.name}
            </SelectItem>
          ))}
          <SelectItem value={MEMBER} className="text-sm">
            {t("accessBuilder.roleMember", "Member")}
          </SelectItem>
        </SelectContent>
      </Select>
      {lockRole ? (
        <p className="mt-1.5 text-xs text-muted-foreground">
          {t("members.memberEditor.cantChangeOwnRole", "You can't change your own role.")}
        </p>
      ) : null}
    </Field>
  )
}
