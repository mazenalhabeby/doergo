"use client"

import Link from "next/link"
import {
  Calendar,
  MapPin,
  Clock,
  User,
  Users,
  Plus,
  Target,
  Layers,
  Zap,
  X,
  Crown,
  ExternalLink,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { InlineEditField } from "./inline-edit-field"
import { STORY_POINT_OPTIONS } from "@/lib/api"

interface TaskDetailSidebarProps {
  task: any
  canEdit: boolean
  hasModule: (m: string) => boolean
  onFieldSave: (field: string, value: string) => Promise<void> | void
  onAssignClick: () => void
  onRemoveAssignee?: (assigneeId: string) => void
  onSetLead?: (assigneeId: string) => void
  sprints?: { id: string; name: string; status: string }[]
  phases?: { id: string; name: string; color: string }[]
  epics?: { id: string; name: string; color: string }[]
}

function SidebarRow({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ElementType
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3 py-2">
      <Icon className="size-4 text-muted-foreground mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-muted-foreground mb-0.5">{label}</p>
        <div className="text-sm text-foreground min-w-0 overflow-hidden">{children}</div>
      </div>
    </div>
  )
}

function getInitials(first: string, last: string) {
  return `${first?.[0] || ""}${last?.[0] || ""}`.toUpperCase()
}

export function TaskDetailSidebar({
  task,
  canEdit,
  hasModule,
  onFieldSave,
  onAssignClick,
  onRemoveAssignee,
  onSetLead,
  sprints = [],
  phases = [],
  epics = [],
}: TaskDetailSidebarProps) {
  const hasAgile = hasModule("sprints") || hasModule("phases") || hasModule("epics") || hasModule("story_points")
  const assignees = task.assignees || []
  const hasMultiple = assignees.length > 1
  const leadCount = assignees.filter((a: any) => a.role === "LEAD").length

  return (
    <div className="space-y-4">
      {/* ─── Details Card ─────────────────────────────────────────────── */}
      <div className="bg-card rounded-2xl border border-border shadow-sm p-5">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Details</h3>

        <div className="divide-y divide-border/50">
          {/* Assignees */}
          <div className="py-2.5">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Users className="size-4 text-muted-foreground" />
                <span className="text-[11px] text-muted-foreground">Assignees</span>
                {assignees.length > 0 && (
                  <span className="text-[10px] text-muted-foreground/60 bg-muted px-1 py-0.5 rounded font-medium">{assignees.length}</span>
                )}
              </div>
              {canEdit && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
                  onClick={onAssignClick}
                >
                  <Plus className="size-3 mr-0.5" /> Add
                </Button>
              )}
            </div>

            {assignees.length > 0 ? (
              <div className="space-y-1">
                {assignees.map((a: any) => {
                  const isLead = a.role === "LEAD"
                  // Can remove if: canEdit AND (not the only lead, or not lead at all)
                  const canRemove = canEdit && !(isLead && leadCount <= 1 && hasMultiple)
                  const canPromote = canEdit && !isLead && hasMultiple

                  return (
                    <div
                      key={a.id}
                      className="group flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="size-6 rounded-full bg-foreground/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-[9px] font-semibold text-foreground">
                          {getInitials(a.user.firstName, a.user.lastName)}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <Link href={`/members/${a.userId}`} className="text-xs font-medium text-foreground truncate block hover:text-blue-600 transition-colors">
                          {a.user.firstName} {a.user.lastName}
                        </Link>
                      </div>
                      {isLead && (
                        <span className="text-[9px] bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400 px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider flex-shrink-0">
                          Lead
                        </span>
                      )}
                      {/* Actions — visible on hover */}
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        {canPromote && onSetLead && (
                          <button
                            onClick={() => onSetLead(a.id)}
                            className="size-5 rounded flex items-center justify-center text-muted-foreground/60 hover:text-foreground hover:bg-muted transition-colors"
                            title="Make lead"
                          >
                            <Crown className="size-3" />
                          </button>
                        )}
                        {canRemove && onRemoveAssignee && (
                          <button
                            onClick={() => onRemoveAssignee(a.id)}
                            className="size-5 rounded flex items-center justify-center text-muted-foreground/60 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                            title="Remove"
                          >
                            <X className="size-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : task.assignedTo ? (
              <div className="flex items-center gap-2 px-2 py-1.5">
                <div className="size-6 rounded-full bg-foreground/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-[9px] font-semibold text-foreground">
                    {getInitials(task.assignedTo.firstName, task.assignedTo.lastName)}
                  </span>
                </div>
                <Link href={`/members/${task.assignedTo.id}`} className="text-xs font-medium text-foreground hover:text-blue-600 transition-colors">
                  {task.assignedTo.firstName} {task.assignedTo.lastName}
                </Link>
              </div>
            ) : (
              <button
                onClick={canEdit ? onAssignClick : undefined}
                className={cn(
                  "w-full flex items-center gap-2 px-2 py-2 rounded-lg border border-dashed border-border/60 text-xs text-muted-foreground/50",
                  canEdit && "hover:border-foreground/20 hover:text-muted-foreground cursor-pointer transition-colors",
                )}
              >
                <Plus className="size-3.5" />
                <span>Assign someone</span>
              </button>
            )}
          </div>

          {/* Due Date */}
          <SidebarRow icon={Calendar} label="Due Date">
            <InlineEditField
              value={task.dueDate}
              onSave={(v) => onFieldSave("dueDate", v)}
              type="date"
              disabled={!canEdit}
              placeholder="Set due date"
            />
          </SidebarRow>

          {/* Start Date */}
          <SidebarRow icon={Calendar} label="Start Date">
            <InlineEditField
              value={task.startDate}
              onSave={(v) => onFieldSave("startDate", v)}
              type="date"
              disabled={!canEdit}
              placeholder="Set start date"
            />
          </SidebarRow>

          {/* Location */}
          <SidebarRow icon={MapPin} label="Location">
            <div className="space-y-1 min-w-0">
              {task.space && (
                <Link href={`/locations`} className="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1 transition-colors">
                  {task.space.name}
                  <ExternalLink className="size-2.5" />
                </Link>
              )}
              <InlineEditField
                value={task.locationAddress}
                onSave={(v) => onFieldSave("locationAddress", v)}
                type="text"
                disabled={!canEdit}
                placeholder="Add location"
                renderDisplay={(v) => v ? (
                  <span className="text-xs text-foreground/80 leading-snug break-words">{String(v)}</span>
                ) : null}
              />
            </div>
          </SidebarRow>

          {/* Estimated Hours */}
          <SidebarRow icon={Clock} label="Estimated Hours">
            <InlineEditField
              value={task.estimatedHours}
              onSave={(v) => onFieldSave("estimatedHours", v)}
              type="number"
              disabled={!canEdit}
              placeholder="—"
              renderDisplay={(v) => v != null && String(v) !== "" ? `${v}h` : null}
            />
          </SidebarRow>

          {/* Created By */}
          <SidebarRow icon={User} label="Created By">
            <span className="text-sm text-foreground">
              {task.createdBy ? `${task.createdBy.firstName} ${task.createdBy.lastName}` : "—"}
            </span>
          </SidebarRow>

          {/* Created Date */}
          <SidebarRow icon={Calendar} label="Created">
            <span className="text-sm text-muted-foreground">
              {new Date(task.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </span>
          </SidebarRow>
        </div>
      </div>

      {/* ─── Agile Card ───────────────────────────────────────────────── */}
      {hasAgile && (
        <div className="bg-card rounded-2xl border border-border shadow-sm p-5">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Agile</h3>

          <div className="divide-y divide-border/50">
            {hasModule("sprints") && (
              <SidebarRow icon={Target} label="Sprint">
                <InlineEditField
                  value={task.sprintId}
                  onSave={(v) => onFieldSave("sprintId", v)}
                  type="select"
                  disabled={!canEdit}
                  placeholder="No sprint"
                  options={[
                    { value: "__none__", label: "No sprint" },
                    ...sprints.map(s => ({ value: s.id, label: s.name })),
                  ]}
                  renderDisplay={() => task.sprint?.name || null}
                />
              </SidebarRow>
            )}

            {hasModule("phases") && (
              <SidebarRow icon={Layers} label="Phase">
                <InlineEditField
                  value={task.phaseId}
                  onSave={(v) => onFieldSave("phaseId", v)}
                  type="select"
                  disabled={!canEdit}
                  placeholder="No phase"
                  options={[
                    { value: "__none__", label: "No phase" },
                    ...phases.map(p => ({ value: p.id, label: p.name, color: p.color })),
                  ]}
                  renderDisplay={() => task.phase ? (
                    <span className="flex items-center gap-1.5">
                      <span className="size-2 rounded-full" style={{ backgroundColor: task.phase.color }} />
                      {task.phase.name}
                    </span>
                  ) : null}
                />
              </SidebarRow>
            )}

            {hasModule("epics") && (
              <SidebarRow icon={Zap} label="Epic">
                <InlineEditField
                  value={task.epicId}
                  onSave={(v) => onFieldSave("epicId", v)}
                  type="select"
                  disabled={!canEdit}
                  placeholder="No epic"
                  options={[
                    { value: "__none__", label: "No epic" },
                    ...epics.map(e => ({ value: e.id, label: e.name, color: e.color })),
                  ]}
                  renderDisplay={() => task.epic ? (
                    <span className="flex items-center gap-1.5">
                      <span className="size-2 rounded-full" style={{ backgroundColor: task.epic.color }} />
                      {task.epic.name}
                    </span>
                  ) : null}
                />
              </SidebarRow>
            )}

            {hasModule("story_points") && (
              <SidebarRow icon={Zap} label="Story Points">
                <InlineEditField
                  value={task.storyPoints}
                  onSave={(v) => onFieldSave("storyPoints", v)}
                  type="select"
                  disabled={!canEdit}
                  placeholder="—"
                  options={[
                    { value: "__none__", label: "None" },
                    ...STORY_POINT_OPTIONS.map(p => ({ value: String(p), label: String(p) })),
                  ]}
                  renderDisplay={(v) => v != null && String(v) !== "" ? `${v} pts` : null}
                />
              </SidebarRow>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
