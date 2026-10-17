"use client"

import {
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu"
import type { TaskContextMenuInnerState } from "./use-task-context-menu-inner"
import type { TaskContextMenuInner } from "./task-context-menu"

/** Part of TaskContextMenuInner's markup, moved here unchanged; it reads the page's state from `vm`. */
export function TaskContextMenuInnerMenu3({ vm, actions, phases, task }: { vm: TaskContextMenuInnerState; actions: Parameters<typeof TaskContextMenuInner>[0]['actions']; phases: NonNullable<Parameters<typeof TaskContextMenuInner>[0]['phases']>; task: Parameters<typeof TaskContextMenuInner>[0]['task'] }) {
  const { hasModule, t } = vm
  return (
    <>{hasModule('phases') && actions.onPhaseChange && phases.length > 0 && (
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
                <span
                  className="size-2 rounded-full mr-2 flex-shrink-0"
                  style={{ backgroundColor: phase.color }}
                />
                {phase.name}
              </ContextMenuItem>
            )
          })}
        </ContextMenuSubContent>
      </ContextMenuSub>
    )}</>
  )
}
