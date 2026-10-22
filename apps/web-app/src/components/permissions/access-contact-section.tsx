"use client"

import { keys } from "@/lib/query-keys"
import { useMemo, useRef } from "react"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { personName } from "@hbcfield/shared/client"
import { organizationsApi } from "@/lib/api"
import { Checkbox } from "@/components/ui/checkbox"
import { UserAvatar } from "@/components/common/user-avatar"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Field } from "./access-field"
import type { AccessFieldsProps } from "./access-field-types"

/** Contact access: WHO this member may reach (No one / All / Specific), and the specific people. */
export function AccessContactSection({
  value,
  onChange,
  excludeContactId,
}: Pick<AccessFieldsProps, "value" | "onChange" | "excludeContactId">) {
  const { t } = useTranslation()

  /*
    Who may be picked as a specific contact: admins and managers only.

    "Manager" is exactly what the chat rule means by it — ADMIN or
    canManageUsers — so the list offers the same people canReach already treats
    as always-reachable. It previously also admitted canViewAllTasks and
    canAssignTasks holders, which is most of a dispatch team, so "Specific
    contacts" listed nearly everyone and read like a directory.

    Anyone ALREADY on the allow-list is kept in the result even if they no
    longer qualify, captured once on mount so a row cannot vanish under the
    cursor while it is being unticked. Dropping them would not remove the grant
    — it is still saved and still enforced by canReach — only hide it.
  */
  const initiallyAllowed = useRef<Set<string>>(new Set(value.contactAllowedIds))
  // Stable across renders (the ref never changes), so this does not re-key the query.
  const keepIds = useMemo(() => [...initiallyAllowed.current].sort(), [])

  const { data: membersData } = useQuery({
    // Admins and managers are chosen by the DATABASE. This used to ask for 200
    // full member rows — Access Profiles, contact allow-lists, role joins — and
    // filter them in the browser to render a handful.
    queryKey: keys.members.list({
      limit: 200,
      managersOnly: true,
      includeIds: keepIds.length ? keepIds : undefined,
      excludeId: excludeContactId || undefined,
    }),
    queryFn: () =>
      organizationsApi.getMembers({
        limit: 200,
        managersOnly: true,
        includeIds: keepIds.length ? keepIds : undefined,
        excludeId: excludeContactId || undefined,
      }),
    staleTime: 60000,
  })

  // Both the leadership filter and the self-exclusion happen in the query.
  const candidateContacts = useMemo(() => membersData?.data || [], [membersData])

  return (
    <Field dataTour="access-contact" label={t("accessBuilder.contactAccess", "Contact access")}>
      <div className="space-y-2">
        <div className="space-y-2.5 rounded-xl border border-border px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                {t("accessBuilder.canContact.title", "Can contact")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t(
                  "accessBuilder.canContact.desc",
                  "Who this member may reach. Open to all teammates by default; restrict to " +
                    "specific people if needed.",
                )}
              </p>
            </div>
            <Select value={value.contactScope} onValueChange={(v) => onChange({ contactScope: v })}>
              <SelectTrigger className="h-8 w-[168px] shrink-0 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE" className="text-xs">
                  {t("accessBuilder.contactScope.none", "Space contacts only")}
                </SelectItem>
                <SelectItem value="ALL" className="text-xs">
                  {t("accessBuilder.contactScope.all", "All contacts")}
                </SelectItem>
                <SelectItem value="SELECTED" className="text-xs">
                  {t("accessBuilder.contactScope.selected", "Specific contacts…")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          {value.contactScope === "SELECTED" && (
            <div className="max-h-44 space-y-0.5 overflow-y-auto rounded-lg border border-border p-1.5">
              {candidateContacts.length === 0 ? (
                <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                  {t("accessBuilder.noContacts", "No contacts available")}
                </p>
              ) : (
                candidateContacts.map((c) => {
                  const checked = value.contactAllowedIds.includes(c.id)
                  return (
                    <label
                      key={c.id}
                      className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-accent"
                    >
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
                      <UserAvatar
                        firstName={c.firstName}
                        lastName={c.lastName}
                        avatarUrl={c.avatarUrl}
                        seed={c.id}
                        size="sm"
                      />
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
