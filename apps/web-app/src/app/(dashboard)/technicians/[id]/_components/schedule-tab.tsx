"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Calendar, Pencil, Save, X } from "lucide-react"
import { toast } from "sonner"
import { useTranslation } from "react-i18next"

import {
  techniciansApi,
  type ScheduleEntry,
  type ScheduleEntryInput,
} from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

const DAY_NAME_KEYS = [
  "technicians.scheduleTab.days.sunday",
  "technicians.scheduleTab.days.monday",
  "technicians.scheduleTab.days.tuesday",
  "technicians.scheduleTab.days.wednesday",
  "technicians.scheduleTab.days.thursday",
  "technicians.scheduleTab.days.friday",
  "technicians.scheduleTab.days.saturday",
]

function formatTime12h(time: string): string {
  const [hours, minutes] = time.split(":")
  const h = parseInt(hours!, 10)
  const ampm = h >= 12 ? "PM" : "AM"
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:${minutes} ${ampm}`
}

interface EditableScheduleRow {
  dayOfWeek: number
  startTime: string
  endTime: string
  isActive: boolean
  notes: string
}

function createDefaultSchedule(): EditableScheduleRow[] {
  return Array.from({ length: 7 }, (_, i) => ({
    dayOfWeek: i,
    startTime: "09:00",
    endTime: "17:00",
    isActive: i >= 1 && i <= 5, // Mon-Fri active by default
    notes: "",
  }))
}

function scheduleToEditable(schedule: ScheduleEntry[]): EditableScheduleRow[] {
  const rows = createDefaultSchedule()
  for (const entry of schedule) {
    const row = rows[entry.dayOfWeek]
    if (row) {
      row.startTime = entry.startTime
      row.endTime = entry.endTime
      row.isActive = entry.isActive
      row.notes = entry.notes || ""
    }
  }
  return rows
}

interface ScheduleTabProps {
  technicianId: string
  canManage: boolean
}

export function ScheduleTab({ technicianId, canManage }: ScheduleTabProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [isEditing, setIsEditing] = useState(false)
  const [editRows, setEditRows] = useState<EditableScheduleRow[]>(
    createDefaultSchedule()
  )

  const { data, isLoading } = useQuery({
    queryKey: ["technicianSchedule", technicianId],
    queryFn: () => techniciansApi.getSchedule(technicianId),
    enabled: !!technicianId,
  })

  const saveMutation = useMutation({
    mutationFn: (schedule: ScheduleEntryInput[]) =>
      techniciansApi.setSchedule(technicianId, schedule),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["technicianSchedule", technicianId],
      })
      setIsEditing(false)
      toast.success(t('technicians.scheduleTab.savedSuccessfully'))
    },
    onError: (error: Error) => {
      toast.error(error.message || t('technicians.scheduleTab.failedToSave'))
    },
  })

  const schedule = data?.schedule || []
  const hasSchedule = schedule.length > 0

  const startEditing = () => {
    setEditRows(hasSchedule ? scheduleToEditable(schedule) : createDefaultSchedule())
    setIsEditing(true)
  }

  const cancelEditing = () => {
    setIsEditing(false)
  }

  const handleSave = () => {
    const scheduleInput: ScheduleEntryInput[] = editRows.map((row) => ({
      dayOfWeek: row.dayOfWeek,
      startTime: row.startTime,
      endTime: row.endTime,
      isActive: row.isActive,
      notes: row.notes || undefined,
    }))
    saveMutation.mutate(scheduleInput)
  }

  const updateRow = (
    dayOfWeek: number,
    field: keyof EditableScheduleRow,
    value: string | boolean
  ) => {
    setEditRows((prev) =>
      prev.map((row) =>
        row.dayOfWeek === dayOfWeek ? { ...row, [field]: value } : row
      )
    )
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!hasSchedule && !isEditing) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center text-muted-foreground">
            <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-medium text-foreground mb-2">
              {t('technicians.scheduleTab.noSchedule')}
            </h3>
            <p className="text-sm mb-4">
              {t('technicians.scheduleTab.noScheduleDescription')}
            </p>
            {canManage && (
              <Button onClick={startEditing}>{t('technicians.scheduleTab.setSchedule')}</Button>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{t('technicians.scheduleTab.title')}</CardTitle>
            <CardDescription>
              {isEditing
                ? t('technicians.scheduleTab.descriptionEdit')
                : t('technicians.scheduleTab.descriptionView')}
            </CardDescription>
          </div>
          {canManage && !isEditing && (
            <Button variant="outline" size="sm" onClick={startEditing}>
              <Pencil className="h-4 w-4 mr-2" />
              {t('technicians.scheduleTab.editSchedule')}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-36">{t('technicians.scheduleTab.dayColumn')}</TableHead>
              <TableHead>{t('technicians.scheduleTab.hoursColumn')}</TableHead>
              <TableHead>{t('technicians.scheduleTab.notesColumn')}</TableHead>
              <TableHead className="w-24 text-center">{t('technicians.scheduleTab.statusColumn')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isEditing
              ? editRows.map((row) => (
                  <TableRow key={row.dayOfWeek}>
                    <TableCell className="font-medium">
                      {t(DAY_NAME_KEYS[row.dayOfWeek]!)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Input
                          type="time"
                          value={row.startTime}
                          onChange={(e) =>
                            updateRow(row.dayOfWeek, "startTime", e.target.value)
                          }
                          className="w-32"
                          disabled={!row.isActive}
                        />
                        <span className="text-muted-foreground">{t('technicians.scheduleTab.to')}</span>
                        <Input
                          type="time"
                          value={row.endTime}
                          onChange={(e) =>
                            updateRow(row.dayOfWeek, "endTime", e.target.value)
                          }
                          className="w-32"
                          disabled={!row.isActive}
                        />
                      </div>
                    </TableCell>
                    <TableCell>
                      <Input
                        placeholder={t('technicians.scheduleTab.optionalNotes')}
                        value={row.notes}
                        onChange={(e) =>
                          updateRow(row.dayOfWeek, "notes", e.target.value)
                        }
                        className="max-w-xs"
                        disabled={!row.isActive}
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={row.isActive}
                        onCheckedChange={(checked) =>
                          updateRow(row.dayOfWeek, "isActive", checked)
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))
              : DAY_NAME_KEYS.map((nameKey, i) => {
                  const entry = schedule.find((s) => s.dayOfWeek === i)
                  return (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{t(nameKey)}</TableCell>
                      <TableCell>
                        {entry && entry.isActive
                          ? `${formatTime12h(entry.startTime)} - ${formatTime12h(entry.endTime)}`
                          : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {entry?.notes || "—"}
                      </TableCell>
                      <TableCell className="text-center">
                        {entry?.isActive ? (
                          <Badge className="bg-green-500/15 text-green-600 dark:text-green-400">
                            {t('technicians.scheduleTab.activeBadge')}
                          </Badge>
                        ) : (
                          <Badge className="bg-muted text-muted-foreground">
                            {t('technicians.scheduleTab.offBadge')}
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
          </TableBody>
        </Table>

        {isEditing && (
          <div className="flex justify-end gap-2 mt-4 pt-4 border-t">
            <Button
              variant="outline"
              onClick={cancelEditing}
              disabled={saveMutation.isPending}
            >
              <X className="h-4 w-4 mr-2" />
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleSave}
              disabled={saveMutation.isPending}
            >
              <Save className="h-4 w-4 mr-2" />
              {saveMutation.isPending ? t('common.saving') : t('technicians.scheduleTab.saveSchedule')}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
