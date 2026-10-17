"use client"

import { keys } from "@/lib/query-keys"
import { useMemo, useRef } from "react"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { organizationsApi } from "@/lib/api"
import { ACCESS_PERMISSION_SCHEMA } from "@hbcfield/shared/client"
import type { AccessDraft, MobileModule } from "@hbcfield/shared/client"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

// Permission key → short label (for the "Grants: …" role summary line).
export const ORG_PERM_LABEL: Record<string, string> = Object.fromEntries(
  ACCESS_PERMISSION_SCHEMA.map((p) => [p.key, p.label]),
)

/**
 * The five permissions this editor can toggle directly — they are columns on the
 * member. Everything else in the catalogue is granted by the assigned ROLE and is
 * shown here read-only, attributed, so this screen answers "what can this person
 * do?" completely instead of answering a third of it and staying silent about the
 * rest.
 *
 * They are deliberately NOT made editable per member. The union of a member flag
 * and a role grant cannot say no — the codebase already carries that scar — so a
 * per-member override could only ever widen, never restrict, and "why can this
 * person still approve overtime?" would have two places to look instead of one.
 */
/**
 * The five permissions that still have their own column on the User row, and so
 * can be granted to ONE member on top of whatever their role gives them.
 *
 * They are no longer editable here. Resolved access merges the role and these
 * columns with a union (mergePermissions only ever sets true), so a per-member
 * switch could add a capability but never take one away: unticking "Allow
 * reports" on someone whose role grants it changed nothing, while looking
 * exactly like a restriction. A control that cannot do the thing it appears to
 * do is worse than no control.
 *
 * Existing grants are still SHOWN — and only here — because they are otherwise
 * invisible drift: nothing on the roles page reveals that one member was handed
 * an extra capability years ago. They can be cleared, not created.
 */
export const LEGACY_DIRECT_KEYS = [
  "canCreateTasks", "canAssignTasks", "canViewAllTasks", "canManageUsers", "canViewReports",
] as const

export function Field({ label, children, dataTour }: { label: string; children: React.ReactNode; dataTour?: string }) {
  return (
    <div data-tour={dataTour}>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      {children}
    </div>
  )
}

/** AccessFields's state and handlers — everything before its markup, moved here unchanged. */
export function useAccessFields({
  value,
  onChange,
  excludeContactId,
  showRole = true,
  lockRole = false,
  allowAdmin = true,
  roleOnly = false,
  external = false,
}: Pick<{
  value: AccessDraft
  /** Emit a partial patch; the parent owns the draft. */
  onChange: (patch: Partial<AccessDraft>) => void
  /** Member id to hide from the "Specific contacts" picker (omit when inviting). */
  excludeContactId?: string
  /** Show the Role selector (member edit + invite). */
  showRole?: boolean
  /** Lock the Role selector (editing your own row — can't change your own role). */
  lockRole?: boolean
  /** Render ONLY the role selector — for an admin, whose permissions are fixed. */
  roleOnly?: boolean
  /** Offer the Admin option (member edit). Invites can't create admins → false. */
  allowAdmin?: boolean
  /**
   * This person works for a client or partner. Shows only what shapes their
   * SCREENS — where they log in, and which tabs they get.
   *
   * The four sections dropped are not hidden for tidiness, they are sections
   * that cannot mean anything here: the org Role is refused by the server, the
   * Permissions readout is derived from that role and so reads "grants no
   * permissions yet" for everybody external, remote clock-in belongs to
   * somebody who clocks in, and space visibility is settled by their single
   * assignment. A control that cannot take effect is worse than an absent one
   * — somebody sets it and waits for something to happen.
   *
   * Their actual powers come from the role they are given IN a space.
   */
  external?: boolean
}, 'value' | 'onChange' | 'excludeContactId' | 'showRole' | 'lockRole' | 'allowAdmin' | 'roleOnly' | 'external'>) {
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

  // Org-wide roles (Admin / Manager / custom) for the role selector.
  const { data: orgRoles } = useQuery({
    queryKey: keys.organization.roles(),
    queryFn: () => organizationsApi.getRoles(),
    staleTime: 60000,
  })
  // Current selector value: "admin" (system), a role id, or "member" (no role).
  const ADMIN = "__admin__"
  const MEMBER = "__member__"
  const roleValue = value.systemRole === "ADMIN" ? ADMIN : (value.memberRoleId ?? MEMBER)
  // Only EMPLOYEE-assignable roles (Admin is its own top option).
  const assignableRoles = (orgRoles || []).filter((r) => r.slug !== "admin")
  const selectedRole = assignableRoles.find((r) => r.id === value.memberRoleId)
  const rolePerms = value.systemRole === "ADMIN"
    ? [t("accessBuilder.fullAccess", "Full access")]
    : selectedRole?.permissions
    ? Object.entries(selectedRole.permissions).filter(([, v]) => v === true).map(([k]) => ORG_PERM_LABEL[k] || k)
    : []

  /**
   * Every permission this member effectively holds, grouped by domain and
   * attributed to where it comes from — the role, or a direct grant on the
   * member. Admin holds the whole catalogue, so show it rather than an empty
   * box: "Admin" saying nothing about overtime or clients is exactly the
   * silence this block exists to remove.
   */
  const permView = useMemo(() => {
    const isAdmin = value.systemRole === "ADMIN"
    const direct = new Set(
      LEGACY_DIRECT_KEYS.filter((k) => value[k] === true),
    )
    const rows = ACCESS_PERMISSION_SCHEMA.flatMap((p) => {
      const fromRole = isAdmin || selectedRole?.permissions?.[p.key] === true
      if (fromRole) return [{ ...p, direct: false }]
      if (direct.has(p.key as (typeof LEGACY_DIRECT_KEYS)[number])) return [{ ...p, direct: true }]
      return []
    })
    const byDomain = new Map<string, typeof rows>()
    for (const p of rows) {
      const list = byDomain.get(p.domain) ?? []
      list.push(p)
      byDomain.set(p.domain, list)
    }
    return { groups: [...byDomain.entries()], directCount: rows.filter((r) => r.direct).length }
  }, [value, selectedRole])

  /** Does this member hold canViewAllTasks — the permission the space list is
   *  scoped against — from either their role or a direct grant? */
  const seesAllSpacesAnyway =
    value.systemRole === "ADMIN" ||
    selectedRole?.permissions?.canViewAllTasks === true ||
    value.canViewAllTasks === true

  const toggleModule = (m: MobileModule) =>
    onChange({
      modules: value.modules.includes(m)
        ? value.modules.filter((x) => x !== m)
        : [...value.modules, m],
    })

  /*
    The Role selector, lifted out of the tree so it can be rendered on its own.

    An admin's Access tab replaced this WHOLE component with a "full access,
    nothing to configure" note. True of permissions — an admin holds all of them
    — and false of the one control that is not a permission: the Role selector is
    how somebody stops being an admin, so hiding it meant an admin could never be
    demoted anywhere in the product.
  */
  // Not for an external member: the server refuses an org-wide role for one, so
  // the selector would be a control whose value is discarded.
  const roleField = showRole && !external ? (
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
              <SelectItem value={ADMIN} className="text-sm">{t("members.roles.admin", "Admin")}</SelectItem>
            )}
            {assignableRoles.map((r) => (
              <SelectItem key={r.id} value={r.id} className="text-sm">{r.name}</SelectItem>
            ))}
            <SelectItem value={MEMBER} className="text-sm">{t("accessBuilder.roleMember", "Member")}</SelectItem>
          </SelectContent>
        </Select>
        {lockRole ? (
          <p className="mt-1.5 text-xs text-muted-foreground">{t("members.memberEditor.cantChangeOwnRole", "You can't change your own role.")}</p>
        ) : null}
      </Field>
  ) : null

  return {
    t,
    candidateContacts,
    selectedRole,
    permView,
    seesAllSpacesAnyway,
    toggleModule,
    roleField,
  }
}

/** What AccessFields and its sections read. */
export type AccessFieldsState = ReturnType<typeof useAccessFields>
