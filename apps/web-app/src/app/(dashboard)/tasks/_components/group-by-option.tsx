"use client"

import React from "react"
import type { Phase } from "@/lib/api"
import { User, Archive, Layers } from "lucide-react"
import { getPriorityConfig } from "@/lib/constants"
import type { Task, Sprint, Epic } from "@/lib/api"
import type { TaskContextMenuActions } from "./task-context-menu"

export type GroupByOption = "none" | "sprint" | "epic" | "assignee" | "priority" | "space"

interface GroupDef {
  key: string
  label: string
  sublabel?: string
  dotColor?: string
  icon?: React.ReactNode
}

export interface GroupedListProps {
  tasks: Task[]
  groupBy: GroupByOption
  sprints?: Sprint[]
  epics?: Epic[]
  spaces?: { id: string; name: string }[]
  canAssign?: boolean
  onAssign?: (taskId: string) => void
  onGroupChange?: (taskId: string, updates: Record<string, string | null>) => void
  onReorder?: (taskId: string, newPosition: number, groupKey: string) => void
  onCreateSprint?: () => void
  onCreateEpic?: () => void
  contextActions?: TaskContextMenuActions
  phases?: Phase[]
  recentAssignees?: { id: string; firstName: string; lastName: string }[]
}

// ─── Group field mapping ────────────────────────────────────────────────────

export function getGroupField(groupBy: GroupByOption): string | null {
  switch (groupBy) {
    case "sprint": return "sprintId"
    case "epic": return "epicId"
    case "assignee": return "assignedToId"
    case "priority": return "priority"
    case "space": return "spaceId"
    default: return null
  }
}

// ─── Build groups from tasks ────────────────────────────────────────────────

export function buildGroups(
  groupBy: GroupByOption, tasks: Task[], sprints: Sprint[], epics: Epic[], spaces: { id: string; name: string }[],
  t: (key: string) => string,
): { groups: GroupDef[]; tasksByGroup: Map<string, Task[]> } {
  const tasksByGroup = new Map<string, Task[]>()
  const addTask = (key: string, task: Task) => { if (!tasksByGroup.has(key)) tasksByGroup.set(key, []); tasksByGroup.get(key)!.push(task) }

  switch (groupBy) {
    case "sprint": {
      const groups: GroupDef[] = [...sprints]
        .sort((a, b) => { const o: Record<string, number> = {
          ACTIVE: 0,
          PLANNING: 1,
          COMPLETED: 2
        }; return (o[a.status] ?? 9) - (o[b.status] ?? 9) })
        .map(s => ({
          key: s.id,
          label: s.name,
          sublabel: s.status === "ACTIVE"
            ? t("common.active")
            : s.status === "PLANNING" ? t("tasks.groups.planning") : t("tasks.statusTabs.COMPLETED"),
          dotColor: s.status === "ACTIVE" ? "#22C55E" : s.status === "PLANNING" ? "#3B82F6" : "#94A3B8"
        }))
      groups.push({ key: "__none__", label: t("tasks.groups.backlog"), icon: <Archive className="size-3.5" />, dotColor: "#94A3B8" })
      for (const g of groups) tasksByGroup.set(g.key, [])
      for (const t of tasks) addTask(t.sprintId || "__none__", t)
      return { groups, tasksByGroup }
    }
    case "epic": {
      const groups: GroupDef[] = epics.map(e => ({ key: e.id, label: e.name, dotColor: e.color }))
      groups.push({ key: "__none__", label: t("tasks.groups.noEpic"), dotColor: "#94A3B8" })
      for (const g of groups) tasksByGroup.set(g.key, [])
      for (const t of tasks) addTask(t.epicId || "__none__", t)
      return { groups, tasksByGroup }
    }
    case "assignee": {
      const map = new Map<string, { id: string; first: string; last: string }>()
      for (const t of tasks) {
        if (t.assignees?.length) { const l = t.assignees.find(a => a.role === "LEAD") ||
          t.assignees[0]; if (l) map.set(l.user.id, { id: l.user.id, first: l.user.firstName, last: l.user.lastName }) }
        else if (t.assignedTo) map.set(t.assignedTo.id, { id: t.assignedTo.id, first: t.assignedTo.firstName, last: t.assignedTo.lastName })
      }
      const groups: GroupDef[] = Array.from(
        map.values()).sort((a, b) => `${a.first} ${a.last}`.localeCompare(
          `${b.first} ${b.last}`)).map(a => ({ key: a.id, label: `${a.first} ${a.last}` }))
      groups.push({
        key: "__none__",
        label: t("tasks.progress.unassigned"),
        icon: <User className="size-3.5 text-muted-foreground/50" />,
        dotColor: "#94A3B8"
      })
      for (const g of groups) tasksByGroup.set(g.key, [])
      for (const t of tasks) {
        let id: string | null = null
        if (t.assignees?.length) { const l = t.assignees.find(a => a.role === "LEAD"); id = l?.user.id || t.assignees[0]?.user.id || null }
        else if (t.assignedTo) id = t.assignedTo.id
        addTask(id || "__none__", t)
      }
      return { groups, tasksByGroup }
    }
    case "priority": {
      const groups: GroupDef[] = [
        "URGENT",
        "HIGH",
        "MEDIUM",
        "LOW"].map(p => { const c = getPriorityConfig(p); return { key: p, label: c.label, dotColor: c.hex } })
      for (const g of groups) tasksByGroup.set(g.key, [])
      for (const t of tasks) addTask(t.priority || "MEDIUM", t)
      return { groups, tasksByGroup }
    }
    case "space": {
      const groups: GroupDef[] = spaces.map(s => ({
        key: s.id,
        label: s.name,
        icon: <Layers className="size-3.5 text-muted-foreground" />
      }))
      groups.push({ key: "__none__", label: t("tasks.groups.noSpace"), dotColor: "#94A3B8" })
      for (const g of groups) tasksByGroup.set(g.key, [])
      for (const t of tasks) addTask(t.spaceId || "__none__", t)
      return { groups, tasksByGroup }
    }
    default:
      return { groups: [], tasksByGroup: new Map() }
  }
}
