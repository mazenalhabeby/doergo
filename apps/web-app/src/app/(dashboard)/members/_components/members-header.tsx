"use client"

import Link from "next/link"
import { useTranslation } from "react-i18next"
import { Search, UserPlus, Smartphone, Shield } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { AccessRole } from "@/lib/api"

/** The Members page's header: the count, phone sync, search, the role filter, Roles and Invite. */
export function MembersHeader({
  isLoading,
  totalCount,
  showPhoneSync,
  search,
  onSearchChange,
  roleFilter,
  onRoleFilterChange,
  orgRoles,
  isAdmin,
  billingLocked,
  billingLockReason,
  onManageRoles,
  onInvite,
}: {
  isLoading: boolean
  totalCount: number
  /** Only where phones keep work offline, and only for whoever manages people. */
  showPhoneSync: boolean
  search: string
  onSearchChange: (value: string) => void
  roleFilter: string
  onRoleFilterChange: (value: string) => void
  orgRoles: AccessRole[]
  isAdmin: boolean
  billingLocked: boolean
  billingLockReason: string | undefined
  onManageRoles: () => void
  onInvite: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="mb-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">
            {t("members.team")}{" "}
            {!isLoading && <span className="text-muted-foreground font-normal text-lg">({totalCount})</span>}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("members.teamSubtitle")}</p>
        </div>

        <div className="flex items-center gap-3">
          {/* Phone sync — only where phones keep work offline, and only for whoever manages people. */}
          {showPhoneSync && (
            <Button asChild variant="outline" size="sm" className="h-9 rounded-lg">
              <Link href="/members/phone-sync">
                <Smartphone className="h-4 w-4 mr-2" />
                {t("members.phoneSync.entry")}
              </Link>
            </Button>
          )}
          {/* Search */}
          <div className="relative" data-tour="members-search">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("members.searchPlaceholder")}
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-9 w-56 h-9 bg-card border-border/80 rounded-lg text-sm"
            />
          </div>

          {/* Role filter */}
          <Select value={roleFilter} onValueChange={onRoleFilterChange}>
            <SelectTrigger className="w-[130px] h-9 bg-card border-border/80 rounded-lg text-sm">
              <SelectValue placeholder={t("common.all")} />
            </SelectTrigger>
            <SelectContent>
              {/*
                The roles this organization has, and the one state that is not
                a role.

                This listed the ACCOUNT TYPES as well — so "Admin" appeared
                twice meaning two different things, and "Employee" and "No
                role" were two labels for the same people. Both duplications
                came from exposing an internal distinction (account type vs
                assigned role) that nobody outside the code thinks in.

                A member either holds one of these roles or holds none, and
                the Role column already says exactly that. The filter now
                offers what the column shows.
              */}
              <SelectItem value="all">{t("common.allRoles")}</SelectItem>
              {orgRoles.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name}
                </SelectItem>
              ))}
              {/* No role assigned — which the list displays as Employee. */}
              <SelectItem value="none">{t("members.roles.employee")}</SelectItem>
            </SelectContent>
          </Select>

          {/* Manage roles */}
          {isAdmin && (
            <Button onClick={onManageRoles} size="sm" variant="outline" className="h-9 px-4 rounded-lg font-medium">
              <Shield className="h-4 w-4 mr-1.5" />
              {t("roles.manage", "Roles")}
            </Button>
          )}

          {/* Invite */}
          {isAdmin && (
            <Button
              disabled={billingLocked}
              title={billingLocked ? billingLockReason : undefined}
              onClick={onInvite}
              size="sm"
              data-tour="members-invite"
              className="h-9 px-4 rounded-lg font-medium"
            >
              <UserPlus className="h-4 w-4 mr-1.5" />
              {t("members.inviteShort")}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
