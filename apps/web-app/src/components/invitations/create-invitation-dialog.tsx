"use client"

import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Copy, Check } from "lucide-react"
import { toast } from "sonner"

import { useAuth } from "@/contexts/auth-context"
import { invitationsApi, type CreateInvitationInput, TechnicianType, WorkMode } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const EXPIRY_OPTIONS = [
  { value: "24", label: "24 hours" },
  { value: "48", label: "48 hours" },
  { value: "72", label: "3 days" },
  { value: "168", label: "7 days" },
  { value: "720", label: "30 days" },
] as const

const SPECIALTY_OPTIONS = [
  { value: "electrical", label: "Electrical" },
  { value: "plumbing", label: "Plumbing" },
  { value: "mechanical", label: "Mechanical" },
  { value: "hvac", label: "HVAC" },
  { value: "general", label: "General" },
  { value: "other", label: "Other" },
] as const

interface CreateInvitationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateInvitationDialog({
  open,
  onOpenChange,
}: CreateInvitationDialogProps) {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  // Form state
  const [targetRole, setTargetRole] = useState<"TECHNICIAN" | "DISPATCHER">("TECHNICIAN")
  const [expiresInHours, setExpiresInHours] = useState("72")
  const [technicianType, setTechnicianType] = useState<string>("")
  const [workMode, setWorkMode] = useState<string>("")
  const [specialty, setSpecialty] = useState<string>("")
  const [maxDailyJobs, setMaxDailyJobs] = useState("")

  // Success state
  const [generatedCode, setGeneratedCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const isDispatcher = user?.role === "DISPATCHER"

  const createMutation = useMutation({
    mutationFn: (input: CreateInvitationInput) => invitationsApi.create(input),
    onSuccess: (data) => {
      setGeneratedCode(data?.code || null)
      queryClient.invalidateQueries({ queryKey: ["invitations"] })
      toast.success("Invitation created successfully")
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to create invitation")
    },
  })

  const handleSubmit = () => {
    const input: CreateInvitationInput = {
      targetRole,
      expiresInHours: parseInt(expiresInHours),
    }

    if (targetRole === "TECHNICIAN") {
      if (technicianType) input.technicianType = technicianType
      if (workMode) input.workMode = workMode
      if (specialty) input.specialty = specialty
      if (maxDailyJobs) input.maxDailyJobs = parseInt(maxDailyJobs)
    }

    createMutation.mutate(input)
  }

  const handleCopyCode = async () => {
    if (!generatedCode) return
    await navigator.clipboard.writeText(generatedCode)
    setCopied(true)
    toast.success("Code copied to clipboard")
    setTimeout(() => setCopied(false), 2000)
  }

  const handleClose = () => {
    onOpenChange(false)
    // Reset form after animation
    setTimeout(() => {
      setTargetRole("TECHNICIAN")
      setExpiresInHours("72")
      setTechnicianType("")
      setWorkMode("")
      setSpecialty("")
      setMaxDailyJobs("")
      setGeneratedCode(null)
      setCopied(false)
      createMutation.reset()
    }, 200)
  }

  // If we have a generated code, show the success view
  if (generatedCode) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invitation Created</DialogTitle>
            <DialogDescription>
              Share this code with the person you want to invite. They will use it
              during registration on the mobile app.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center py-6 space-y-4">
            <div className="flex items-center justify-center gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl w-full">
              <span className="text-3xl font-mono font-bold tracking-[0.3em] text-slate-800">
                {generatedCode}
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleCopyCode}
                className="shrink-0"
              >
                {copied ? (
                  <Check className="h-5 w-5 text-green-600" />
                ) : (
                  <Copy className="h-5 w-5 text-slate-400" />
                )}
              </Button>
            </div>
            <p className="text-sm text-slate-500 text-center">
              This code will only be shown once. Make sure to copy it now.
            </p>
          </div>

          <DialogFooter>
            <Button onClick={handleClose} className="w-full">
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Invitation</DialogTitle>
          <DialogDescription>
            Generate an invitation code to add a new member to your organization.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Target Role */}
          <div className="space-y-2">
            <Label>Role</Label>
            {isDispatcher ? (
              <div className="flex items-center h-9 px-3 rounded-md border border-slate-200 bg-slate-50 text-sm text-slate-700">
                Technician
              </div>
            ) : (
              <Select
                value={targetRole}
                onValueChange={(v) => setTargetRole(v as "TECHNICIAN" | "DISPATCHER")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TECHNICIAN">Technician</SelectItem>
                  <SelectItem value="DISPATCHER">Dispatcher</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Expiry */}
          <div className="space-y-2">
            <Label>Expires In</Label>
            <Select value={expiresInHours} onValueChange={setExpiresInHours}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPIRY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Technician-specific fields */}
          {targetRole === "TECHNICIAN" && (
            <>
              <div className="space-y-2">
                <Label>Employment Type</Label>
                <Select value={technicianType} onValueChange={setTechnicianType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={TechnicianType.FULL_TIME}>Full-Time</SelectItem>
                    <SelectItem value={TechnicianType.FREELANCER}>Freelancer</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Work Mode</Label>
                <Select value={workMode} onValueChange={setWorkMode}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select work mode (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={WorkMode.HYBRID}>Hybrid</SelectItem>
                    <SelectItem value={WorkMode.ON_SITE}>On-Site</SelectItem>
                    <SelectItem value={WorkMode.ON_ROAD}>On-Road</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Specialty</Label>
                <Select value={specialty} onValueChange={setSpecialty}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select specialty (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {SPECIALTY_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Max Daily Jobs</Label>
                <Input
                  type="number"
                  placeholder="e.g. 5 (optional)"
                  value={maxDailyJobs}
                  onChange={(e) => setMaxDailyJobs(e.target.value)}
                  min={1}
                  max={20}
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? "Creating..." : "Create Invitation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
