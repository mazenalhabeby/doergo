"use client"

import { personName } from "@hbcfield/shared/client"
import { Checkbox } from "@/components/ui/checkbox"
import { UserAvatar } from "@/components/common/user-avatar"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Field } from "./use-access-fields"
import type { AccessFieldsState } from "./use-access-fields"
import type { AccessFields } from "./access-fields"

/** Part of AccessFields's markup, moved here unchanged; it reads the page's state from `vm`. */
export function AccessFieldsContactAccess(
  {
    vm,
    value,
    onChange
  }: {
    vm: AccessFieldsState;
    value: Parameters<typeof AccessFields>[0]['value'];
    onChange: Parameters<typeof AccessFields>[0]['onChange']
  }) {
  const { t, candidateContacts } = vm
  return (
    <Field dataTour="access-contact" label={t("accessBuilder.contactAccess", "Contact access")}>
      <div className="space-y-2">
        <div className="space-y-2.5 rounded-xl border border-border px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{t("accessBuilder.canContact.title", "Can contact")}</p>
              <p
                className="text-xs text-muted-foreground">{t(
                  "accessBuilder.canContact.desc",
                  ("Who this member may reach. Open to all teammates by default; restrict to " + "specific people if needed."))}</p>
            </div>
            <Select value={value.contactScope} onValueChange={(v) => onChange({ contactScope: v })}>
              <SelectTrigger className="h-8 w-[168px] shrink-0 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE" className="text-xs">{t("accessBuilder.contactScope.none", "Space contacts only")}</SelectItem>
                <SelectItem value="ALL" className="text-xs">{t("accessBuilder.contactScope.all", "All contacts")}</SelectItem>
                <SelectItem
                  value="SELECTED"
                  className="text-xs">{t("accessBuilder.contactScope.selected", "Specific contacts…")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {value.contactScope === "SELECTED" && (
            <div className="max-h-44 space-y-0.5 overflow-y-auto rounded-lg border border-border p-1.5">
              {candidateContacts.length === 0 ? (
                <p
                  className="px-2 py-3 text-center text-xs text-muted-foreground">{t(
                    "accessBuilder.noContacts",
                    "No contacts available")}</p>
              ) : (
                candidateContacts.map((c) => {
                  const checked = value.contactAllowedIds.includes(c.id)
                  return (
                    <label key={c.id} className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-accent">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) =>
                          onChange({
                            contactAllowedIds: v
                              ? [...value.contactAllowedIds, c.id]
                              : value.contactAllowedIds.filter((id) => id !== c.id),
                          })
                        }
                      />
                      <UserAvatar firstName={c.firstName} lastName={c.lastName} avatarUrl={c.avatarUrl} seed={c.id} size="sm" />
                      <span className="min-w-0 flex-1 truncate text-sm">{personName(c)}</span>
                      {/* Label by what actually confers it. Calling someone
                          "Manager" when no role says so is how a permission
                          left on a user row reads as a job title. */}
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {c.role === "ADMIN"
                          ? t("members.roles.admin")
                          : c.memberRole?.name
                          ? c.memberRole.name
                          : c.canManageUsers
                          ? t("accessBuilder.contactDirectPermission", "Direct permission — no role")
                          : t("accessBuilder.contactLegacyPick", "No longer a manager")}
                      </span>
                    </label>
                  )
                })
              )}
            </div>
          )}
        </div>
      </div>
    </Field>
  )
}
