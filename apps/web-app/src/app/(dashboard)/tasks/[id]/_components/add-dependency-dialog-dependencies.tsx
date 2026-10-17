"use client"

import { Plus, Search, Loader2 } from "lucide-react"
import { type Task } from "@/lib/api"
import { Input } from "@/components/ui/input"
import { DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DEP_TYPE_LABELS, DEP_TYPE_KEYS } from "./add-dependency-dialog-helpers"
import type { AddDependencyDialogState } from "./use-add-dependency-dialog"

/** Part of AddDependencyDialog's markup, moved here unchanged; it reads the page's state from `vm`. */
export function AddDependencyDialogDependencies({ vm }: { vm: AddDependencyDialogState }) {
  const {
    t,
    depType,
    setDepType,
    search,
    setSearch,
    filteredResults,
    searching,
    stepOf,
    addMutation,
  } = vm
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{t("tasks.dependencies.add")}</DialogTitle>
      </DialogHeader>

      <div className="space-y-4">
        {/* Dependency type */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            {t("tasks.dependencies.type")}
          </label>
          <Select value={depType} onValueChange={setDepType}>
            <SelectTrigger className="h-9 rounded-lg">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(DEP_TYPE_KEYS).map(([val, labelKey]) => (
                <SelectItem key={val} value={val}>
                  {t(labelKey)} ({DEP_TYPE_LABELS[val]})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder={t("tasks.dependencies.searchTasks")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 rounded-lg"
            autoFocus
          />
        </div>

        {/* Results */}
        <div className="max-h-[240px] overflow-y-auto rounded-lg border border-border/50">
          {filteredResults.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              {searching ? t("common.searching") : t("tasks.dependencies.noMatchingTasks")}
            </div>
          )}
          {filteredResults.map((task: Task) => {
            const step = stepOf(task)
            return (
              <button
                key={task.id}
                onClick={() => addMutation.mutate(task.id)}
                disabled={addMutation.isPending}
                className={"w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/50 " +
                  "transition-colors border-b border-border/30 last:border-b-0"}
              >
                <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: step.hex }} title={step.label} />
                <span className="text-sm font-medium text-foreground truncate flex-1">
                  {task.title}
                </span>
                {addMutation.isPending ? (
                  <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                ) : (
                  <Plus className="size-3.5 text-muted-foreground" />
                )}
              </button>
            )
          })}
        </div>
      </div>
    </DialogContent>
  )
}
