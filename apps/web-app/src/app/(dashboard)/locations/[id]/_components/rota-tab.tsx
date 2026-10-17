"use client"

import { keys } from "@/lib/query-keys"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { addDays, format, startOfWeek } from "date-fns"
import {
  AlertTriangle,
  Plus,
  CalendarClock,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Trash2,
  Loader2,
  User,
  Users
} from "lucide-react"

import { notify } from "@/lib/toast"
import {
  rotaApi,
  shiftsApi,
  employeesApi,
  spaceMembersApi,
  type CreateRotaInput,
} from "@/lib/api"
import { UserAvatar } from "@/components/user-avatar"
import { personName, type ShiftAssignment, ShiftRecurrence } from "@hbcfield/shared/client"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ConfirmTargetDialog } from "@/components/confirm-dialog"
import { SectionHeader, EmptyState } from "./section-header"
import { useRotaTab, cellHasConflict, WEEKDAY_KEYS } from "./use-rota-tab"
import { RECURRENCE_BADGE, RotaDialog } from "./rota-tab-helpers"
import { RotaTabRota } from "./rota-tab-rota"

export function RotaTab({ spaceId }: { spaceId: string }) {
  const vm = useRotaTab({ spaceId })
  const {
    t,
    dialogOpen,
    setDialogOpen,
    editTarget,
    setEditTarget,
    deleteTarget,
    setDeleteTarget,
    assignments,
    isLoading,
    setWeekStart,
    days,
    dayStrs,
    todayStr,
    scheduledMembers,
    openMembers,
    cellFor,
    weekConflicts,
    removeMutation,
    recurrenceSummary,
  } = vm

  return (
    <div className="space-y-4">
      <SectionHeader
        icon={CalendarDays}
        accent="sky"
        title={t("scheduling.rota.heading")}
        description={t("scheduling.rota.intro")}
        action={
          <Button onClick={() => { setEditTarget(null); setDialogOpen(true) }} className="gap-1.5">
            <Plus className="h-4 w-4" />
            {t("scheduling.rota.new")}
          </Button>
        }
      />

      <RotaTabRota vm={vm} />

      {dialogOpen && (
        <RotaDialog
          spaceId={spaceId}
          assignment={editTarget}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
        />
      )}

      <ConfirmTargetDialog
        target={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={t("scheduling.rota.deleteTitle")}
        description={t("scheduling.rota.deleteConfirm")}
        confirmLabel={t("common.delete")}
        mutation={removeMutation}
      />
    </div>
  )
}
