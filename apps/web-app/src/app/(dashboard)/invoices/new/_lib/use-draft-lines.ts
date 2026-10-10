"use client"

import { useMemo } from "react"
import type { TFunction } from "i18next"
import {
  buildLabourLines,
  buildWorkspaceLines,
  labourTotalCents,
  type LabourGrouping,
  type LabourEntry,
  type PersonWork,
} from "@hbcfield/shared/client"

import type { InvoiceItemInput } from "@/lib/api"
import { formatDayKey } from "@/lib/day-key"
import { num, type EditableLine } from "../../_components/invoice-fields"
import type { DayRun, HourRun, LineStyle, WorkEntry } from "./draft-model"

/**
 * Every line of the draft, built ONCE — the preview renders them and the
 * mutation sends them — plus the totals read off the same list.
 */
export function useDraftLines({
  entries, dayRuns, hourRuns, manualLines, rateNum, grouping, groupByRole, lineStyle, siteMode,
  taxPct, discount, entryParts, t, language,
}: {
  entries: WorkEntry[]
  dayRuns: DayRun[]
  hourRuns: HourRun[]
  manualLines: EditableLine[]
  rateNum: number
  grouping: LabourGrouping
  groupByRole: boolean
  lineStyle: LineStyle
  /** A WORKSPACE invoice charges each person's time on site; a CLIENT invoice charges job hours. */
  siteMode: boolean
  taxPct: string
  discount: string
  entryParts: (e: WorkEntry) => number
  t: TFunction
  language: string
}) {
  /*
    ⚠️ ONE CALCULATION, SHOWN AND SENT.

    The screen used to total the work with its own loop while the mutation built
    the lines with another — so choosing a grouping changed what was SENT and
    nothing on screen moved, which is exactly how it was reported. Two
    arithmetics over one invoice is also how a displayed total quietly stops
    matching the document it produced.

    So the lines are built once, here, by the shared rule; the preview renders
    them and the mutation sends them.
  */
  const labourEntries = useMemo<LabourEntry[]>(
    () =>
      entries
        .filter((e) => e.include)
        .map((e) => ({
          taskId: e.taskId,
          taskTitle: e.taskTitle,
          reportId: e.reportId ?? null,
          workerName: e.workerName ?? null,
          hours: e.hours,
          // The form's fallback rate applies where the ladder had no answer.
          billRateCents: e.billRateCents ?? (rateNum > 0 ? Math.round(rateNum * 100) : null),
          costRateCents: e.costRateCents ?? null,
          workerId: e.workerId ?? null,
          workRoleId: e.workRoleId ?? null,
          workRoleName: e.workRoleName ?? null,
          hoursBillable: e.hoursBillable,
        })),
    [entries, rateNum],
  )
  const includedDays = useMemo(() => dayRuns.filter((d) => d.include), [dayRuns])
  const includedHours = useMemo(() => hourRuns.filter((h) => h.include), [hourRuns])
  const anyWorkRole = entries.some((e) => e.workRoleId) || dayRuns.some((d) => d.workRoleId) || hourRuns.some((h) => h.workRoleId)

  const range = (from: string, to: string) => ({
    from: formatDayKey(from, language, { year: false }),
    to: formatDayKey(to, language, { year: false }),
  })
  /*
    One labour line's words, by the chosen style. The tag, the "72 h" and the
    "/ hour" already say what the line is, so "hours worked" may go; the dates
    only appear where a line covers part of the period.
  */
  const describe = (kind: "hours" | "days", name: string, count: number, split: boolean, fromDay: string, toDay: string) => {
    const dated = split && lineStyle.dates
    if (lineStyle.words === "name") {
      return dated ? t("invoices.create.nameLineRange", { name, ...range(fromDay, toDay) }) : name
    }
    if (kind === "hours") {
      return dated ? t("invoices.create.hoursLineRange", { name, ...range(fromDay, toDay) }) : t("invoices.create.hoursLine", { name })
    }
    return dated
      ? t("invoices.create.daysLineRange", { name, count, ...range(fromDay, toDay) })
      : t("invoices.create.daysLine", { name, count })
  }
  const labourLines = useMemo(
    () => siteMode
      ? buildWorkspaceLines(
          (() => {
            const people = new Map<string, PersonWork>()
            const person = (id: string, name: string, roleId?: string | null, roleName?: string | null) => {
              const p = people.get(id) ?? { workerId: id, workerName: name, workRoleId: roleId ?? null, workRoleName: roleName ?? null, hours: [], days: [], jobs: [] }
              if (!p.workRoleId && roleId) { p.workRoleId = roleId; p.workRoleName = roleName ?? null }
              people.set(id, p)
              return p
            }
            for (const h of includedHours) person(h.workerId, h.workerName, h.workRoleId, h.workRoleName).hours.push(h)
            for (const d of includedDays) person(d.workerId, d.workerName, d.workRoleId, d.workRoleName).days.push(d)
            for (const e of labourEntries) {
              if (!e.workerId) continue
              person(e.workerId, e.workerName ?? t("invoices.create.unassignedWorker"), e.workRoleId, e.workRoleName).jobs.push(e)
            }
            return [...people.values()]
          })(),
          {
            listJobs: grouping === "both",
            groupByRole,
            noRoleLabel: t("invoices.create.otherRole"),
            describeHours: (h, split) => describe("hours", h.workerName, h.hours, split, h.fromDay, h.toDay),
            describeDays: (d, split) => describe("days", d.workerName, d.days, split, d.fromDay, d.toDay),
          },
        )
      : buildLabourLines(labourEntries, grouping, t("invoices.create.unassignedWorker"), {
        days: includedDays,
        groupByRole,
        noRoleLabel: t("invoices.create.otherRole"),
        // The reader's language and the reader's dates; the shared rule only arranges.
        describeDays: (d, split) => describe("days", d.workerName, d.days, split, d.fromDay, d.toDay),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [labourEntries, grouping, t, includedDays, includedHours, groupByRole, language, siteMode, lineStyle],
  )

  const labourSubtotal = useMemo(() => labourTotalCents(labourLines) / 100, [labourLines])

  /*
    THE DOCUMENT — every line, in order, exactly as it will be filed.

    ⚠️ One list, rendered AND sent. The sheet below is not a picture of the
    invoice; it is the invoice, and the mutation maps straight off this. A
    preview built separately from the payload is a preview that eventually lies,
    and the lie is only found by a customer holding both.
  */
  const documentItems = useMemo(() => {
    const rows: Array<InvoiceItemInput & { descriptive?: boolean }> = []

    for (const line of labourLines) {
      rows.push({
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPriceCents / 100,
        taskId: line.taskId || undefined,
        reportId: line.reportId || undefined,
        billRateCents: line.billRateCents,
        costRateCents: line.costRateCents,
        billedHours: line.billedHours,
        billedDays: line.billedDays,
        lineKind: line.kind,
        workerId: line.workerId,
        dayFrom: line.dayFrom,
        dayTo: line.dayTo,
        taskIds: line.taskIds,
        hoursBasis: line.hoursBasis ?? null,
        descriptive: line.descriptive,
      })
    }
    for (const e of entries) {
      if (!e.include || !e.includeParts) continue
      for (const part of e.parts) {
        rows.push({
          description: part.partNumber ? `${part.name} (${part.partNumber})` : part.name,
          quantity: part.quantity,
          unitPrice: part.unitCost,
          taskId: e.taskId,
          reportId: e.reportId || undefined,
        })
      }
    }
    for (const m of manualLines) {
      if (!m.description.trim()) continue
      rows.push({
        description: m.description.trim(),
        // ⚠️ `num`, not `Number`. A half-typed "3," is NaN to `Number` and would
        // put NaN on the document; the shared parser also accepts a comma
        // decimal, which is what most of Europe types.
        quantity: num(m.quantity),
        unitPrice: num(m.unitPrice),
      })
    }
    return rows
  }, [labourLines, entries, manualLines])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const partsSubtotal = useMemo(() => entries.reduce((s, e) => s + entryParts(e), 0), [entries])
  const workSubtotal = labourSubtotal + partsSubtotal
  const manualSubtotal = useMemo(
    () => manualLines.reduce((s, m) => s + num(m.quantity) * num(m.unitPrice), 0),
    [manualLines],
  )
  const subtotal = workSubtotal + manualSubtotal
  const taxAmount = subtotal * ((Number(taxPct) || 0) / 100)
  const total = subtotal + taxAmount - (Number(discount) || 0)

  // Live per-worker hours summary from the included entries.
  const workerSummary = useMemo(() => {
    const map = new Map<string, number>()
    for (const e of entries) {
      if (!e.include || !e.workerName || e.hours <= 0) continue
      map.set(e.workerName, Math.round(((map.get(e.workerName) || 0) + e.hours) * 100) / 100)
    }
    return Array.from(map.entries()).map(([name, hours]) => ({ name, hours })).sort((a, b) => b.hours - a.hours)
  }, [entries])
  const totalHours = workerSummary.reduce((s, w) => s + w.hours, 0)

  return {
    includedDays, includedHours, anyWorkRole, documentItems,
    workSubtotal, subtotal, taxAmount, total, workerSummary, totalHours,
  }
}
