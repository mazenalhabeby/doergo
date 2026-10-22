"use client"

import { useTranslation } from "react-i18next"
import { CheckSquare, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { CollapsibleSection } from "./collapsible-section"
import { type CreateTaskForm } from "./use-create-task-form"

/** The checklist the task starts with — only when the module is enabled. */
export function ChecklistSection({ form }: { form: CreateTaskForm }) {
  const { t } = useTranslation()
  const {
    hasModule,
    checklistItems,
    newChecklistItem,
    setNewChecklistItem,
    addChecklistItem,
    removeChecklistItem,
    checklistIndicator,
    isSubmitting,
  } = form
  if (!hasModule('checklists')) return null

  return (
    <CollapsibleSection icon={CheckSquare} label={t("tasks.sections.checklist")} indicator={checklistIndicator}>
      {checklistItems.length > 0 && (
        <div className="space-y-1">
          {checklistItems.map((item, index) => (
            <div
              key={index}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-muted/50 border border-border/50 group"
            >
              <CheckSquare className="size-3 text-muted-foreground flex-shrink-0" />
              <span className="text-sm text-foreground flex-1 truncate">{item}</span>
              <button
                type="button"
                onClick={() => removeChecklistItem(index)}
                className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all"
              >
                <Trash2 className="size-3 text-red-500" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Input
          placeholder={t("tasks.create.addChecklistItem")}
          value={newChecklistItem}
          onChange={(e) => setNewChecklistItem(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              addChecklistItem()
            }
          }}
          disabled={isSubmitting}
          className="h-8 rounded-lg border-border bg-card text-sm flex-1"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 px-2.5 rounded-lg"
          onClick={addChecklistItem}
          disabled={!newChecklistItem.trim() || isSubmitting}
        >
          <Plus className="size-3.5" />
        </Button>
      </div>
    </CollapsibleSection>
  )
}
