"use client"

import { useState, useEffect } from "react"
import { format } from "date-fns"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Calendar as CalendarIcon, Loader2 } from "lucide-react"

import { tasksApi, type Task, type UpdateTaskInput } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { PrioritySelector } from "@/components/tasks"

interface EditTaskDialogProps {
  task: Task
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function EditTaskDialog({ task, open, onOpenChange }: EditTaskDialogProps) {
  const queryClient = useQueryClient()

  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description || "")
  const [priority, setPriority] = useState<"LOW" | "MEDIUM" | "HIGH" | "URGENT">(
    (task.priority as "LOW" | "MEDIUM" | "HIGH" | "URGENT") || "MEDIUM"
  )
  const [dueDate, setDueDate] = useState<Date | undefined>(
    task.dueDate ? new Date(task.dueDate) : undefined
  )
  const [locationAddress, setLocationAddress] = useState(task.locationAddress || "")

  // Reset form when task changes or dialog opens
  useEffect(() => {
    if (open) {
      setTitle(task.title)
      setDescription(task.description || "")
      setPriority((task.priority as "LOW" | "MEDIUM" | "HIGH" | "URGENT") || "MEDIUM")
      setDueDate(task.dueDate ? new Date(task.dueDate) : undefined)
      setLocationAddress(task.locationAddress || "")
    }
  }, [open, task])

  const updateMutation = useMutation({
    mutationFn: (input: UpdateTaskInput) => tasksApi.update(task.id, input),
    onSuccess: () => {
      toast.success("Task updated successfully")
      onOpenChange(false)
      queryClient.invalidateQueries({ queryKey: ["task", task.id], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["taskTimeline", task.id], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["tasks"], refetchType: "all" })
    },
    onError: (e: Error) => toast.error(e.message || "Failed to update task"),
  })

  const isFormValid = title.trim() !== "" && description.trim() !== ""

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!isFormValid || updateMutation.isPending) return

    updateMutation.mutate({
      title: title.trim(),
      description: description.trim(),
      priority,
      dueDate: dueDate?.toISOString(),
      locationAddress: locationAddress.trim() || undefined,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Edit Task</DialogTitle>
          <DialogDescription>
            Update the task details below.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="edit-title" className="text-sm font-medium text-slate-700">
              Title<span className="text-red-500">*</span>
            </Label>
            <Input
              id="edit-title"
              placeholder="Task title..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={updateMutation.isPending}
              className="h-10 rounded-lg border-slate-200 bg-white"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="edit-description" className="text-sm font-medium text-slate-700">
              Description<span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="edit-description"
              placeholder="Describe the issue..."
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={updateMutation.isPending}
              className="rounded-lg border-slate-200 bg-white resize-none"
            />
          </div>

          {/* Location & Due Date */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="edit-location" className="text-sm font-medium text-slate-700">
                Service Location
              </Label>
              <Input
                id="edit-location"
                placeholder="Enter address..."
                value={locationAddress}
                onChange={(e) => setLocationAddress(e.target.value)}
                disabled={updateMutation.isPending}
                className="h-10 rounded-lg border-slate-200 bg-white"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700">
                Due Date
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "h-10 w-full justify-start text-left font-normal rounded-lg border-slate-200 bg-white hover:bg-slate-50",
                      !dueDate && "text-slate-400"
                    )}
                    disabled={updateMutation.isPending}
                  >
                    <CalendarIcon className="mr-2 size-4 text-slate-400" />
                    {dueDate ? format(dueDate, "MMM d, yyyy") : "Select date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dueDate}
                    onSelect={setDueDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Priority */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-slate-700">Priority</Label>
            <PrioritySelector
              value={priority}
              onChange={setPriority}
              disabled={updateMutation.isPending}
            />
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={updateMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!isFormValid || updateMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
