"use client";

import Link from "next/link";
import { Search, UserPlus, Smartphone, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PAGE_SHELL } from "@/components/ui/page-width";
import { MembersTable } from "./members-table";
import { PendingInvitations } from "./pending-invitations";
import type { MembersPageState } from "../_hooks/use-members-page";

/** Part of MembersPage's markup, moved here unchanged; it reads the page's state from `vm`. */
export function MembersPageTeam({ vm }: { vm: MembersPageState }) {
  const {
    t,
    isLoading,
    totalCount,
    user,
    search,
    setSearch,
    setPage,
    roleFilter,
    setRoleFilter,
    orgRoles,
    isAdmin,
    setRolesOpen,
    billingLocked,
    billingLockReason,
    setInviteOpen,
    members,
    meta,
    isError,
    isFetching,
    refetch,
    selectedIds,
    memberSpacesMap,
    handleSelectMember,
    handleSelectAll,
    setEditTarget,
    setRemoveTarget,
    setTransferTarget,
    router,
    pendingInvitations,
    showPending,
    setShowPending,
    revokeInviteMutation,
  } = vm;
  return (
    <div className={PAGE_SHELL}>
      {/* Page Header */}
      <div className="mb-8">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">
              {t("members.team")} {!isLoading && <span className="text-muted-foreground font-normal text-lg">({totalCount})</span>}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("members.teamSubtitle")}
            </p>
          </div>

          <div className="flex items-center gap-3">
          {/* Phone sync — only where phones keep work offline, and only for whoever manages people. */}
          {user?.canManageUsers && user?.offlineMode && (
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
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              className="pl-9 w-56 h-9 bg-card border-border/80 rounded-lg text-sm"
            />
          </div>

          {/* Role filter */}
          <Select
            value={roleFilter}
            onValueChange={(v) => {
              setRoleFilter(v)
              setPage(1)
            }}
          >
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
            <Button
              onClick={() => setRolesOpen(true)}
              size="sm"
              variant="outline"
              className="h-9 px-4 rounded-lg font-medium"
            >
              <Shield className="h-4 w-4 mr-1.5" />
              {t("roles.manage", "Roles")}
            </Button>
          )}

          {/* Invite */}
          {isAdmin && (
            <Button
              disabled={billingLocked}
              title={billingLocked ? billingLockReason : undefined}
              onClick={() => setInviteOpen(true)}
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

      <MembersTable
        members={members}
        meta={meta}
        isLoading={isLoading}
        isError={isError}
        isFetching={isFetching}
        refetch={refetch}
        isAdmin={isAdmin}
        userId={user?.id}
        isOwner={!!user?.isOwner}
        selectedIds={selectedIds}
        memberSpacesMap={memberSpacesMap}
        onSelectMember={handleSelectMember}
        onSelectAll={handleSelectAll}
        onEdit={setEditTarget}
        onRemove={setRemoveTarget}
        onTransfer={setTransferTarget}
        onNavigate={(id) => router.push(`/members/${id}`)}
        setPage={setPage}
        billingLocked={billingLocked}
        billingLockReason={billingLockReason}
        onInvite={() => setInviteOpen(true)}
      />

      {/* ── Pending Invitations ────────────────────────────────────── */}
      {isAdmin && pendingInvitations.length > 0 && (
        <PendingInvitations
          pendingInvitations={pendingInvitations}
          showPending={showPending}
          onToggle={() => setShowPending((p) => !p)}
          onRevoke={(id) => revokeInviteMutation.mutate(id)}
          revoking={revokeInviteMutation.isPending}
        />
      )}

    </div>
  );
}
