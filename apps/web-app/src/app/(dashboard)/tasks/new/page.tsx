"use client"

import { useState, useCallback, useRef, lazy, Suspense } from "react"
import { useTranslation } from "react-i18next"
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
import { tasksApi, taskAttachmentsApi, type CreateTaskInput } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

// Lazy load the map component to avoid SSR issues with Leaflet
const LocationPicker = lazy(() =>
  import("@/components/location-picker").then((m) => ({ default: m.LocationPicker }))
)
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
  const { t } = useTranslation()
  const router = useRouter()
  const { user } = useAuth()
  const queryClient = useQueryClient()

  // Form state
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [priority, setPriority] = useState<"LOW" | "MEDIUM" | "HIGH" | "URGENT">("MEDIUM")
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined)
  const [locationAddress, setLocationAddress] = useState("")
  const [locationLat, setLocationLat] = useState<number | null>(null)
  const [locationLng, setLocationLng] = useState<number | null>(null)
  const [additionalNotes, setAdditionalNotes] = useState("")
  const [isDragOver, setIsDragOver] = useState(false)
  const [attachments, setAttachments] = useState<File[]>([])

  // State to track submission (more reliable than isPending for preventing double-clicks)
  const [isSubmittingLocal, setIsSubmittingLocal] = useState(false)

  // Create task mutation
  const createMutation = useMutation({
    mutationFn: (input: CreateTaskInput) => tasksApi.create(input),
    onSuccess: async (task) => {
      // Upload attachments if any
      if (attachments.length > 0 && task?.id) {
        for (const file of attachments) {
          try {
            const presign = await taskAttachmentsApi.getPresignedUrl(task.id, file.name, file.type)
            if (presign?.uploadUrl) {
              await fetch(presign.uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })
              await taskAttachmentsApi.confirmUpload(task.id, {
                fileName: file.name,
                fileUrl: presign.fileUrl,
                fileType: file.type,
                fileSize: file.size,
              })
            }
          } catch {
            console.error(`Failed to upload attachment: ${file.name}`)
          }
        }
      }

      toast.success(t("tasks.create.successMessage"))
      await queryClient.invalidateQueries({ queryKey: ["tasks"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["taskStatusCounts"] })
      router.push("/tasks")
    },
    onError: (error: Error) => {
      toast.error(error.message || t("tasks.create.errorMessage"))
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
      toast.error(t("tasks.create.fillRequiredFields"))
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
      locationLat: locationLat ?? undefined,
      locationLng: locationLng ?? undefined,
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
    <div className="min-h-full bg-muted">
      <div className="mx-auto max-w-4xl px-6 py-8">
        {/* Page Title */}
        <h1 className="text-2xl font-semibold text-foreground mb-8">
          {t("tasks.create.title")}
        </h1>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title" className="text-sm font-medium text-foreground">
              {t("tasks.create.taskTitleLabel")}<span className="text-red-500">*</span>
            </Label>
            <Input
              id="title"
              placeholder={t("tasks.create.taskTitlePlaceholder")}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isSubmitting}
              className="h-12 rounded-xl border-border bg-card text-base placeholder:text-muted-foreground focus:border-blue-500 focus:ring-blue-500/20"
            />
          </div>

          {/* Problem Description */}
          <div className="space-y-2">
            <Label htmlFor="description" className="text-sm font-medium text-foreground">
              {t("tasks.create.descriptionLabel")}<span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="description"
              placeholder={t("tasks.create.descriptionPlaceholder")}
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isSubmitting}
              className="rounded-xl border-border bg-card text-base placeholder:text-muted-foreground focus:border-blue-500 focus:ring-blue-500/20 resize-none"
            />
          </div>

          {/* Due Date */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-foreground">
              {t("tasks.create.preferredDateLabel")}
            </Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "h-12 w-full justify-start text-left text-base font-normal rounded-xl border-border bg-card hover:bg-accent",
                    !dueDate && "text-muted-foreground"
                  )}
                  disabled={isSubmitting}
                >
                  <CalendarIcon className="mr-3 size-5 text-muted-foreground" />
                  {dueDate ? format(dueDate, "MMM d, yyyy") : t("tasks.create.selectDate")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dueDate}
                  onSelect={setDueDate}
                  disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Service Location with Map */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-foreground">
              {t("tasks.create.serviceLocationLabel")}
            </Label>
            <Suspense fallback={
              <div className="h-[340px] rounded-xl border border-border bg-muted flex items-center justify-center">
                <Loader2 className="size-6 text-muted-foreground animate-spin" />
              </div>
            }>
              <LocationPicker
                address={locationAddress}
                lat={locationLat}
                lng={locationLng}
                onLocationChange={(addr, lat, lng) => {
                  setLocationAddress(addr)
                  setLocationLat(lat)
                  setLocationLng(lng)
                }}
                disabled={isSubmitting}
              />
            </Suspense>
          </div>

          {/* Attachments */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-foreground">
              {t("tasks.create.attachmentsLabel")}
            </Label>
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={cn(
                "relative rounded-xl border-2 border-dashed transition-all duration-200",
                isDragOver
                  ? "border-blue-400 bg-blue-50"
                  : "border-border bg-card hover:border-border"
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
                <div className="flex size-12 items-center justify-center rounded-xl bg-muted mb-3">
                  <Upload className="size-5 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground font-medium">
                  {t("tasks.create.dragAndDrop")}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t("tasks.create.imagesAndPdfOnly")}
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
                      <div className="relative w-24 h-24 rounded-xl overflow-hidden border border-border bg-muted">
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
                      <div className="relative flex items-center gap-2 rounded-xl bg-muted border border-border pl-3 pr-2 py-2.5">
                        <FileText className="size-5 text-muted-foreground" />
                        <span className="text-sm text-foreground max-w-[120px] truncate">
                          {file.name}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeAttachment(index)}
                          className="p-1 rounded-full hover:bg-muted transition-colors"
                        >
                          <X className="size-3.5 text-muted-foreground" />
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
            <Label htmlFor="notes" className="text-sm font-medium text-foreground">
              {t("tasks.create.additionalNotesLabel")}
            </Label>
            <Textarea
              id="notes"
              placeholder={t("tasks.create.additionalNotesPlaceholder")}
              rows={3}
              value={additionalNotes}
              onChange={(e) => setAdditionalNotes(e.target.value)}
              disabled={isSubmitting}
              className="rounded-xl border-border bg-card text-base placeholder:text-muted-foreground focus:border-blue-500 focus:ring-blue-500/20 resize-none"
            />
          </div>

          {/* Priority Selection */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-foreground">
              {t("tasks.create.priorityLabel")}
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
                {t("tasks.create.submitting")}
              </>
            ) : (
              t("tasks.create.submitButton")
            )}
          </Button>
        </form>
      </div>
    </div>
  )
}
