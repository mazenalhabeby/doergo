"use client"

import { useState, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Calendar as CalendarIcon,
  Upload,
  Loader2,
  X,
  FileText,
} from "lucide-react"

import { useAuth } from "@/contexts/auth-context"
import { tasksApi, type CreateTaskInput } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { PrioritySelector } from "@/components/tasks"

export default function CreateTaskPage() {
  const router = useRouter()
  const { user } = useAuth()
  const queryClient = useQueryClient()

  // Form state
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [priority, setPriority] = useState<"LOW" | "MEDIUM" | "HIGH" | "URGENT">("MEDIUM")
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined)
  const [locationAddress, setLocationAddress] = useState("")
  const [additionalNotes, setAdditionalNotes] = useState("")
  const [isDragOver, setIsDragOver] = useState(false)
  const [attachments, setAttachments] = useState<File[]>([])

  // State to track submission (more reliable than isPending for preventing double-clicks)
  const [isSubmittingLocal, setIsSubmittingLocal] = useState(false)

  // Create task mutation
  const createMutation = useMutation({
    mutationFn: (input: CreateTaskInput) => tasksApi.create(input),
    onSuccess: async () => {
      toast.success("Task created successfully!")
      // Invalidate all task-related queries to ensure fresh data
      await queryClient.invalidateQueries({
        queryKey: ["tasks"],
        refetchType: "all", // Force refetch all matching queries
      })
      router.push("/tasks")
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to create task. Please try again.")
      setIsSubmittingLocal(false)
    },
  })

  // Form validation
  const isFormValid = title.trim() !== "" && description.trim() !== ""
  const isSubmitting = isSubmittingLocal || createMutation.isPending

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    e.stopPropagation()

    // Prevent double submission
    if (isSubmitting) {
      console.log('[Task Form] Blocked duplicate submission')
      return
    }

    if (!isFormValid) {
      toast.error("Please fill in all required fields")
      return
    }

    // Set local state immediately
    setIsSubmittingLocal(true)
    console.log('[Task Form] Submitting task...')

    createMutation.mutate({
      title: title.trim(),
      description: description.trim() + (additionalNotes ? `\n\nAdditional Notes:\n${additionalNotes.trim()}` : ""),
      priority,
      dueDate: dueDate?.toISOString(),
      locationAddress: locationAddress.trim() || undefined,
    })
  }

  // Handle file drop
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const files = Array.from(e.dataTransfer.files).filter(
      file => file.type.startsWith("image/") || file.type === "application/pdf"
    )
    setAttachments(prev => [...prev, ...files])
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files).filter(
        file => file.type.startsWith("image/") || file.type === "application/pdf"
      )
      setAttachments(prev => [...prev, ...files])
    }
  }, [])

  const removeAttachment = useCallback((index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index))
  }, [])

  // Redirect TECHNICIAN users (they can't create tasks)
  if (user?.role === "TECHNICIAN") {
    router.push("/tasks")
    return null
  }

  return (
    <div className="min-h-full bg-slate-50/30">
      <div className="mx-auto max-w-4xl px-6 py-8">
        {/* Page Title */}
        <h1 className="text-2xl font-semibold text-slate-900 mb-8">
          New Service Request
        </h1>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title" className="text-sm font-medium text-slate-700">
              Task Title<span className="text-red-500">*</span>
            </Label>
            <Input
              id="title"
              placeholder="Enter a brief title for your request..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isSubmitting}
              className="h-12 rounded-xl border-slate-200 bg-white text-base placeholder:text-slate-400 focus:border-blue-500 focus:ring-blue-500/20"
            />
          </div>

          {/* Problem Description */}
          <div className="space-y-2">
            <Label htmlFor="description" className="text-sm font-medium text-slate-700">
              Problem Description<span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="description"
              placeholder="Describe the issue in detail..."
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isSubmitting}
              className="rounded-xl border-slate-200 bg-white text-base placeholder:text-slate-400 focus:border-blue-500 focus:ring-blue-500/20 resize-none"
            />
          </div>

          {/* Two Column Row: Location & Due Date */}
          <div className="grid gap-6 sm:grid-cols-2">
            {/* Location */}
            <div className="space-y-2">
              <Label htmlFor="location" className="text-sm font-medium text-slate-700">
                Service Location
              </Label>
              <Input
                id="location"
                placeholder="Enter address..."
                value={locationAddress}
                onChange={(e) => setLocationAddress(e.target.value)}
                disabled={isSubmitting}
                className="h-12 rounded-xl border-slate-200 bg-white text-base placeholder:text-slate-400 focus:border-blue-500 focus:ring-blue-500/20"
              />
            </div>

            {/* Due Date */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700">
                Preferred Date
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "h-12 w-full justify-start text-left text-base font-normal rounded-xl border-slate-200 bg-white hover:bg-slate-50",
                      !dueDate && "text-slate-400"
                    )}
                    disabled={isSubmitting}
                  >
                    <CalendarIcon className="mr-3 size-5 text-slate-400" />
                    {dueDate ? format(dueDate, "MMM d, yyyy") : "Select date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dueDate}
                    onSelect={setDueDate}
                    disabled={(date) => date < new Date()}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Attachments */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-slate-700">
              Attachments
            </Label>
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={cn(
                "relative rounded-xl border-2 border-dashed transition-all duration-200",
                isDragOver
                  ? "border-blue-400 bg-blue-50"
                  : "border-slate-200 bg-white hover:border-slate-300"
              )}
            >
              <input
                type="file"
                accept="image/*,.pdf"
                multiple
                onChange={handleFileSelect}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                disabled={isSubmitting}
              />
              <div className="flex flex-col items-center justify-center py-10 px-4">
                <div className="flex size-12 items-center justify-center rounded-xl bg-slate-100 mb-3">
                  <Upload className="size-5 text-slate-400" />
                </div>
                <p className="text-sm text-slate-600 font-medium">
                  Drag & drop files here, or click to select files
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  (Images and PDF files only)
                </p>
              </div>
            </div>

            {/* Attachment List */}
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-3 mt-4">
                {attachments.map((file, index) => (
                  <div
                    key={index}
                    className="group relative"
                  >
                    {file.type.startsWith("image/") ? (
                      <div className="relative w-24 h-24 rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
                        <img
                          src={URL.createObjectURL(file)}
                          alt={file.name}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all duration-200" />
                        <button
                          type="button"
                          onClick={() => removeAttachment(index)}
                          className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-black/80"
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="relative flex items-center gap-2 rounded-xl bg-slate-100 border border-slate-200 pl-3 pr-2 py-2.5">
                        <FileText className="size-5 text-slate-500" />
                        <span className="text-sm text-slate-700 max-w-[120px] truncate">
                          {file.name}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeAttachment(index)}
                          className="p-1 rounded-full hover:bg-slate-200 transition-colors"
                        >
                          <X className="size-3.5 text-slate-400" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Additional Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes" className="text-sm font-medium text-slate-700">
              Additional Notes
            </Label>
            <Textarea
              id="notes"
              placeholder="Add extra information..."
              rows={3}
              value={additionalNotes}
              onChange={(e) => setAdditionalNotes(e.target.value)}
              disabled={isSubmitting}
              className="rounded-xl border-slate-200 bg-white text-base placeholder:text-slate-400 focus:border-blue-500 focus:ring-blue-500/20 resize-none"
            />
          </div>

          {/* Priority Selection */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-slate-700">
              Priority
            </Label>
            <PrioritySelector
              value={priority}
              onChange={setPriority}
              disabled={isSubmitting}
            />
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            disabled={!isFormValid || isSubmitting}
            className="w-full h-14 rounded-xl bg-blue-600 hover:bg-blue-700 text-base font-medium text-white shadow-lg shadow-blue-600/25 transition-all duration-200 hover:shadow-xl hover:shadow-blue-600/30"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 size-5 animate-spin" />
                Creating...
              </>
            ) : (
              "Submit Request"
            )}
          </Button>
        </form>
      </div>
    </div>
  )
}
