"use client"

import { useTranslation } from "react-i18next"
import type { SpaceMember, SpaceRoleInSpace } from "@hbcfield/shared/client"
import type { spaceMembersApi } from "@/lib/api"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useCents, useSpaceCurrency } from "./work-roles"
import { NONE } from "./role-tag"

type RoleUpdate = Parameters<typeof spaceMembersApi.updateRoles>[2]

/**
 * A member's two role slots here: their trade (work role) and their management role, and whether
 * they may hold both. An external member has no trade and no second role.
 */
export function MemberRolesSection({
  spaceId,
  member,
  roles,
  external,
  onUpdate,
  saving,
  section,
  heading,
}: {
  spaceId: string
  member: SpaceMember
  roles: SpaceRoleInSpace[]
  external: boolean
  onUpdate: (data: RoleUpdate) => void
  saving: boolean
  section: string
  heading: string
}) {
  const { t } = useTranslation()
  const cents = useCents(useSpaceCurrency(spaceId).bill)
  // Only the trades this workspace uses — plus the one this person already holds.
  const workRoles = roles.filter((r) => r.kind === "WORK" && (r.activeHere !== false || r.id === member?.workRole?.id))
  const mgmtRoles = roles.filter((r) => r.kind !== "WORK")
  const allow = member?.allowSecondRole === true
  const hasWork = !!member?.workRole
  const hasMgmt = !!member?.spaceRole
  // The management slot is open when nothing else is held, or two roles are allowed.
  const mgmtOpen = !hasWork || allow || hasMgmt
  const workOpen = !external && (!hasMgmt || allow || hasWork)

  return (
    <section className={section}>
      <h3 className={heading}>{t("scheduling.membersPage.roles")}</h3>
      {!external && (
        <div className="flex items-center justify-between gap-3">
          <Label className="text-sm text-muted-foreground">{t("scheduling.workRoles.workRoleHere")}</Label>
          <Select
            value={member.workRole?.id ?? NONE}
            onValueChange={(v) => onUpdate({ workRoleId: v === NONE ? null : v })}
            disabled={!workOpen || saving}
          >
            <SelectTrigger className="h-8 w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{t("scheduling.workRoles.noWorkRole")}</SelectItem>
              {workRoles.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name}
                  {r.dayRateCents != null && (
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      · {cents(r.dayRateCents)} {t("rates.perDay")}
                    </span>
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {!external && (
        <div className="flex items-center justify-between gap-3">
          <span>
            <Label htmlFor="allow-second" className="text-sm text-muted-foreground">
              {t("scheduling.workRoles.allowSecond")}
            </Label>
            <span className="block text-[11px] text-muted-foreground">{t("scheduling.workRoles.allowSecondHint")}</span>
          </span>
          <Switch
            id="allow-second"
            checked={allow}
            onCheckedChange={(v) => onUpdate({ allowSecondRole: v })}
            disabled={saving}
          />
        </div>
      )}
      <div className="flex items-center justify-between gap-3">
        <Label className="text-sm text-muted-foreground">{t("scheduling.workRoles.managementRoleHere")}</Label>
        <Select
          value={member.spaceRole?.id ?? NONE}
          onValueChange={(v) => onUpdate({ managementRoleId: v === NONE ? null : v })}
          disabled={!mgmtOpen || saving}
        >
          <SelectTrigger className="h-8 w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>{t("scheduling.workRoles.noManagementRole")}</SelectItem>
            {mgmtRoles.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {!mgmtOpen && <p className="text-[11px] text-muted-foreground">{t("scheduling.membersPage.secondRoleOff")}</p>}
    </section>
  )
}
