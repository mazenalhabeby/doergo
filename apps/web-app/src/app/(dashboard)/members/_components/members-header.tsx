"use client"

import Link from "next/link"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PageHeader } from "@/components/page/page-kit"
import type { AccessRole } from "@/lib/api"

/** The Members page's header: the count, phone sync, Roles and Invite — then the search and the role filter. */
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
    <>
      <PageHeader
        title={
          <>
            {t("members.team")}{" "}
            {!isLoading && <span className="font-medium tabular-nums text-muted-foreground/70">{totalCount}</span>}
          </>
        }
        subtitle={t("members.teamSubtitle")}
        actions={
          <>
            {/* Phone sync — only where phones keep work offline, and only for whoever manages people. */}
            {showPhoneSync && (
              <Button asChild variant="outline" size="pill">
                <Link href="/members/phone-sync">
                  <Icon name="sync" />
                  {t("members.phoneSync.entry")}
                </Link>
              </Button>
            )}
            {isAdmin && (
              <Button onClick={onManageRoles} variant="outline" size="pill">
                <Icon name="shield" />
                {t("roles.manage", "Roles")}
              </Button>
            )}
            {isAdmin && (
              <Button
                disabled={billingLocked}
                title={billingLocked ? billingLockReason : undefined}
                onClick={onInvite}
                size="pillLg"
                data-tour="members-invite"
              >
                <Icon name="addUser" />
                {t("members.inviteShort")}
              </Button>
            )}
          </>
        }
      />

      <div className="mb-3.5 flex flex-wrap items-center gap-2.5">
        <div className="relative w-full sm:w-[280px]" data-tour="members-search">
          <Icon
            name="searchLine"
            size={16}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            placeholder={t("members.searchPlaceholder")}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-[38px] rounded-full border-border bg-card pl-10 text-sm shadow-none"
          />
        </div>

        <Select value={roleFilter} onValueChange={onRoleFilterChange}>
          <SelectTrigger className="h-[38px] w-[160px] rounded-xl border-border bg-card text-[13.5px] shadow-none">
            <SelectValue placeholder={t("common.all")} />
          </SelectTrigger>
          <SelectContent>
            {/*
              The roles this organization has, and the one state that is not a role. A member either holds one of
              these roles or holds none, and the Role column already says exactly that — the filter offers what the
              column shows (account types were listed here too once, so "Admin" appeared twice meaning two things).
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
      </div>
    </>
  )
}
