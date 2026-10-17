"use client"

import { keys } from "@/lib/query-keys"
import { spaceRolesApi } from "@/lib/api"
import { DatedRateField } from "@/components/rates/dated-rate"
import { roleQueryKey } from "./work-roles"
import type { RoleDialogState } from "./use-role-dialog"
import type { RoleDialog } from "./space-role-dialog"

/** A work role's day rate here, and the default every other workspace uses. The markup is moved here unchanged. */
export function RoleDialogRates({
  vm,
  role,
  spaceId,
}: {
  vm: RoleDialogState
  role: Parameters<typeof RoleDialog>[0]["role"]
  spaceId: Parameters<typeof RoleDialog>[0]["spaceId"]
}) {
  const { t, money, cents, queryClient, showDefault, setShowDefault } = vm
  return (
    <div className="space-y-4">
      {/* This workspace's own rate — and, below it, the default every other workspace uses. */}
      <DatedRateField
        id="role-day-rate-here"
        label={t("scheduling.workRoles.dayRateHere")}
        hint={t("scheduling.workRoles.dayRateHint")}
        unit="day"
        currency={money.bill}
        currentCents={role!.dayRateSource === "workspace" ? role!.dayRateCents : null}
        emptyLabel={
          role!.defaultDayRateCents != null
            ? t("rates.usesDefault", { rate: `${cents(role!.defaultDayRateCents)} ${t("rates.perDay")}` })
            : undefined
        }
        history={role!.dayRateHistory}
        onSubmit={async (c, from) => {
          await spaceRolesApi.setDayRate(spaceId, role!.id, {
            cents: c,
            ...(from ? { effectiveFrom: from } : {}),
          })
          queryClient.invalidateQueries({ queryKey: roleQueryKey(spaceId) })
        }}
      />
      {/*
        The role's day rate in workspaces that set none. Optional and
        rarely needed, so it stays folded until asked for.
      */}
      {showDefault || role!.defaultDayRateCents != null ? (
        <DatedRateField
          id="role-day-rate-default"
          label={t("rates.defaultDayRate")}
          hint={t("rates.defaultDayRateHint")}
          unit="day"
          currency={money.bill}
          currentCents={role!.defaultDayRateCents ?? null}
          history={role!.defaultDayRateHistory ?? []}
          onSubmit={async (c, from) => {
            await spaceRolesApi.setDefaultDayRate(role!.id, {
              cents: c,
              ...(from ? { effectiveFrom: from } : {}),
            })
            queryClient.invalidateQueries({ queryKey: keys.spaces.roles() })
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setShowDefault(true)}
          className="text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
        >
          {t("rates.otherWorkspaces")} ›
        </button>
      )}
    </div>
  )
}
