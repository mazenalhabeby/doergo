"use client"

import { useTranslation } from "react-i18next"
import { ArrowRight, Archive, MapPin } from "lucide-react"
import {
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu"
import { useAuth } from "@/contexts/auth-context"
import { useSpaceModules } from "@/hooks/use-space-modules"
import { STORY_POINT_OPTIONS } from "@/lib/api"
import type { TaskContextMenuProps } from "./task-context-menu-types"

/** The context menu's planning submenus: sprint, phase, epic, workspace and story points — each where its module is on. */
export function TaskPlanningSubmenus({
  task,
  sprints,
  phases,
  epics,
  spaces,
  actions,
}: Pick<TaskContextMenuProps, "task" | "actions"> &
  Required<Pick<TaskContextMenuProps, "sprints" | "phases" | "epics" | "spaces">>) {
  const { t } = useTranslation()
  /*
    Modules are the SPACE's, and a board can show tasks from several spaces at
    once — so the row asks about its OWN task's space rather than the
    organization's set. Cached per space by the hook, so a board of fifty rows
    from three spaces makes three lookups, not fifty.
  */
  const { hasModule: orgHasModule } = useAuth()
  const { hasModule: spaceHasModule } = useSpaceModules(task.spaceId ?? null)
  const hasModule = task.spaceId ? spaceHasModule : orgHasModule

  return (
    <>
      {/* Move to Sprint submenu */}
      {hasModule("sprints") && actions.onSprintChange && sprints.length > 0 && (
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <ArrowRight className="size-4 mr-2 flex-shrink-0" />
            {t("tasks.menu.moveToSprint")}
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-[180px]">
            <ContextMenuItem
              onClick={() => actions.onSprintChange!(task.id, null)}
              disabled={!task.sprintId}
              className={!task.sprintId ? "opacity-50" : ""}
            >
              <Archive className="size-3.5 mr-2" />
              {t("tasks.menu.backlog")}
            </ContextMenuItem>
            {sprints.map((sprint) => {
              const isCurrent = task.sprintId === sprint.id
              return (
                <ContextMenuItem
                  key={sprint.id}
                  disabled={isCurrent}
                  onClick={() => actions.onSprintChange!(task.id, sprint.id)}
                  className={isCurrent ? "opacity-50" : ""}
                >
                  {sprint.name}
                </ContextMenuItem>
              )
            })}
          </ContextMenuSubContent>
        </ContextMenuSub>
      )}

      {/* Set Phase submenu */}
      {hasModule("phases") && actions.onPhaseChange && phases.length > 0 && (
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <span className="size-4 mr-2 flex-shrink-0 flex items-center justify-center">
              <span className="size-2 rounded-full bg-muted-foreground/40" />
            </span>
            {t("tasks.menu.setPhase")}
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-[180px]">
            <ContextMenuItem
              onClick={() => actions.onPhaseChange!(task.id, null)}
              disabled={!task.phaseId}
              className={!task.phaseId ? "opacity-50" : ""}
            >
              {t("tasks.menu.noPhase")}
            </ContextMenuItem>
            {phases.map((phase) => {
              const isCurrent = task.phaseId === phase.id
              return (
                <ContextMenuItem
                  key={phase.id}
                  disabled={isCurrent}
                  onClick={() => actions.onPhaseChange!(task.id, phase.id)}
                  className={isCurrent ? "opacity-50" : ""}
                >
                  <span className="size-2 rounded-full mr-2 flex-shrink-0" style={{ backgroundColor: phase.color }} />
                  {phase.name}
                </ContextMenuItem>
              )
            })}
          </ContextMenuSubContent>
        </ContextMenuSub>
      )}

      {/* Set Epic submenu */}
      {hasModule("epics") && actions.onEpicChange && epics.length > 0 && (
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <span className="size-4 mr-2 flex-shrink-0 flex items-center justify-center">
              <span className="size-2 rounded-full bg-purple-400" />
            </span>
            {t("tasks.menu.setEpic")}
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-[180px]">
            <ContextMenuItem
              onClick={() => actions.onEpicChange!(task.id, null)}
              disabled={!task.epicId}
              className={!task.epicId ? "opacity-50" : ""}
            >
              {t("tasks.menu.noEpic")}
            </ContextMenuItem>
            {epics.map((epic) => {
              const isCurrent = task.epicId === epic.id
              return (
                <ContextMenuItem
                  key={epic.id}
                  disabled={isCurrent}
                  onClick={() => actions.onEpicChange!(task.id, epic.id)}
                  className={isCurrent ? "opacity-50" : ""}
                >
                  <span className="size-2 rounded-full mr-2 flex-shrink-0" style={{ backgroundColor: epic.color }} />
                  {epic.name}
                </ContextMenuItem>
              )
            })}
          </ContextMenuSubContent>
        </ContextMenuSub>
      )}

      {/* Move to Space submenu */}
      {actions.onSpaceChange && spaces.length > 0 && (
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <MapPin className="size-4 mr-2 flex-shrink-0" />
            {t("tasks.menu.moveToSpace")}
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-[180px]">
            <ContextMenuItem
              onClick={() => actions.onSpaceChange!(task.id, null)}
              disabled={!task.spaceId}
              className={!task.spaceId ? "opacity-50" : ""}
            >
              {t("tasks.menu.noSpace")}
            </ContextMenuItem>
            {spaces.map((space) => {
              const isCurrent = task.spaceId === space.id
              return (
                <ContextMenuItem
                  key={space.id}
                  disabled={isCurrent}
                  onClick={() => actions.onSpaceChange!(task.id, space.id)}
                  className={isCurrent ? "opacity-50" : ""}
                >
                  <MapPin className="size-3 mr-2 flex-shrink-0 text-muted-foreground" />
                  {space.name}
                </ContextMenuItem>
              )
            })}
          </ContextMenuSubContent>
        </ContextMenuSub>
      )}

      {/* Story Points submenu */}
      {hasModule("story_points") && actions.onStoryPointsChange && (
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <span className="size-4 mr-2 flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-muted-foreground">
              {task.storyPoints ?? "#"}
            </span>
            {t("tasks.menu.storyPoints")}
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-[140px]">
            <ContextMenuItem
              onClick={() => actions.onStoryPointsChange!(task.id, null)}
              disabled={task.storyPoints == null}
              className={task.storyPoints == null ? "opacity-50" : ""}
            >
              {t("tasks.menu.none")}
            </ContextMenuItem>
            {STORY_POINT_OPTIONS.map((pts) => {
              const isCurrent = task.storyPoints === pts
              return (
                <ContextMenuItem
                  key={pts}
                  disabled={isCurrent}
                  onClick={() => actions.onStoryPointsChange!(task.id, pts)}
                  className={isCurrent ? "opacity-50" : ""}
                >
                  <span className="text-xs font-bold tabular-nums mr-2">{pts}</span>
                  point{pts !== 1 ? "s" : ""}
                </ContextMenuItem>
              )
            })}
          </ContextMenuSubContent>
        </ContextMenuSub>
      )}
    </>
  )
}
