"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

/** The template's checklist: type an item, add it, remove one. */
export function ChecklistField({
  items: checklistItems,
  onChange: setChecklistItems,
}: {
  items: string[]
  onChange: (items: string[]) => void
}) {
  const { t } = useTranslation()
  const [newChecklistItem, setNewChecklistItem] = useState("")

  const addChecklistItem = () => {
    const trimmed = newChecklistItem.trim()
    if (trimmed) {
      setChecklistItems([...checklistItems, trimmed])
      setNewChecklistItem("")
    }
  }

  return (
    <div className="space-y-2">
      <Label>{t("tasks.sections.checklist")}</Label>
      <div className="flex gap-2">
        <Input
          placeholder={t("tasks.create.addChecklistItem")}
          value={newChecklistItem}
          onChange={(e) => setNewChecklistItem(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addChecklistItem())}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addChecklistItem}
          disabled={!newChecklistItem.trim()}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {checklistItems.length > 0 && (
        <div className="space-y-1 mt-2">
          {checklistItems.map((item, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted text-sm">
              <span className="flex-1">{item}</span>
              <button
                type="button"
                onClick={() => setChecklistItems(checklistItems.filter((_, idx) => idx !== i))}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
