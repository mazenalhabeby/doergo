"use client"

import { useState, useCallback } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Copy, Check, CheckCircle2, Mail, Link2 } from "lucide-react"
import { notify } from "@/lib/toast"

import { useAuth } from "@/contexts/auth-context"
import { invitationsApi, locationsApi, type CreateInvitationInput, type CompanyLocation } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
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

interface CreateInvitationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateInvitationDialog({ open, onOpenChange }: CreateInvitationDialogProps) {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  // Form state
  const [mode, setMode] = useState<"email" | "code">("email")
  const [email, setEmail] = useState("")
  const [position, setPosition] = useState("")
  const [spaceId, setSpaceId] = useState("none")

  // Success state
  const [generatedCode, setGeneratedCode] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [codeCopied, setCodeCopied] = useState(false)

  // Fetch spaces
  const { data: spacesData } = useQuery({
    queryKey: ["locations"],
    queryFn: () => locationsApi.list(),
    staleTime: 60000,
    enabled: open,
  })
  const locations = spacesData?.data || []

  const createMutation = useMutation({
    mutationFn: (input: CreateInvitationInput) => invitationsApi.create(input),
    onSuccess: (data) => {
      const code = data?.code
      if (code) {
        setGeneratedCode(code)
        setSuccess(true)
        navigator.clipboard.writeText(code).catch(() => {})
      }
      queryClient.invalidateQueries({ queryKey: ["invitations"] })
      queryClient.invalidateQueries({ queryKey: ["pendingInvitations"] })
    },
    onError: (error: Error) => {
      notify.error(error.message || "Failed to create invitation")
    },
  })

  const handleSubmit = useCallback(() => {
    // Invitations are always for Employees; management is granted via permissions.
    const input: CreateInvitationInput = { targetRole: "EMPLOYEE" }
    if (mode === "email" && email.trim()) input.email = email.trim()
    if (position.trim()) input.position = position.trim()
    createMutation.mutate(input)
  }, [mode, email, position, createMutation])

  const handleCopyCode = useCallback(async () => {
    if (!generatedCode) return
    await navigator.clipboard.writeText(generatedCode)
    setCodeCopied(true)
    notify.success("Code copied")
    setTimeout(() => setCodeCopied(false), 3000)
  }, [generatedCode])

  const handleSendAnother = useCallback(() => {
    setGeneratedCode(null)
    setSuccess(false)
    setEmail("")
    setPosition("")
    setCodeCopied(false)
  }, [])

  const handleClose = useCallback(() => {
    onOpenChange(false)
    setTimeout(() => {
      setMode("email")
      setEmail("")
      setPosition("")
      setSpaceId("none")
      setGeneratedCode(null)
      setSuccess(false)
      setCodeCopied(false)
      createMutation.reset()
    }, 200)
  }, [onOpenChange, createMutation])

  // ─── Success view ──────────────────────────────────────────────────────

  if (success && generatedCode) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Invite Team Member</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {mode === "email" && email ? (
              <div className="text-center space-y-3">
                <div className="mx-auto w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="font-medium text-foreground">Invitation sent</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    An email has been sent to <span className="font-medium text-foreground">{email}</span>
                  </p>
                </div>
                <div className="bg-muted/60 rounded-lg p-3 space-y-1">
                  <p className="text-xs text-muted-foreground">Invitation code (also in the email)</p>
                  <div className="flex items-center justify-center gap-2">
                    <p className="text-xl font-mono font-bold tracking-[0.15em] text-foreground">{generatedCode}</p>
                    <Button variant="ghost" size="icon" onClick={handleCopyCode} className="h-7 w-7">
                      {codeCopied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center space-y-3">
                <div className="mx-auto w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <Link2 className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="font-medium text-foreground">Invitation code created</p>
                  <p className="text-sm text-muted-foreground mt-1">Share this code with the new team member.</p>
                </div>
                <div className="bg-muted/60 rounded-xl p-5">
                  <p className="text-3xl font-mono font-bold tracking-[0.2em] text-foreground">{generatedCode}</p>
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <Button variant="outline" onClick={handleSendAnother} className="flex-1 rounded-lg">
                {mode === "email" ? "Send Another" : "Create Another"}
              </Button>
              {mode === "code" && (
                <Button variant="outline" onClick={handleCopyCode} className="rounded-lg">
                  {codeCopied ? <><Check className="h-4 w-4 mr-1.5 text-green-600" />Copied</> : <><Copy className="h-4 w-4 mr-1.5" />Copy</>}
                </Button>
              )}
              <Button onClick={handleClose} className="flex-1 rounded-lg">Done</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  // ─── Form view ─────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Invite Team Member</DialogTitle>
          <DialogDescription>Send an email invitation or generate a code to share manually.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Method toggle */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Method</Label>
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-muted/60 rounded-lg">
              <button
                type="button"
                onClick={() => setMode("email")}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-md py-2 text-sm font-medium transition-all",
                  mode === "email" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Mail className="h-4 w-4" />Email
              </button>
              <button
                type="button"
                onClick={() => setMode("code")}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-md py-2 text-sm font-medium transition-all",
                  mode === "code" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Link2 className="h-4 w-4" />Code
              </button>
            </div>
          </div>

          {/* Email (email mode only) */}
          {mode === "email" && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Email</Label>
              <Input type="email" placeholder="team@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className="h-9" />
            </div>
          )}

          {/* Position / title */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">
              Position <span className="text-muted-foreground/50">(optional)</span>
            </Label>
            <Input
              placeholder="e.g. Plumber, Field Technician"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              className="h-9"
            />
          </div>

          {/* Space (optional) */}
          {locations.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                Space <span className="text-muted-foreground/50">(optional)</span>
              </Label>
              <Select value={spaceId} onValueChange={setSpaceId}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Assign to a space on join" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No space</SelectItem>
                  {locations.map((loc: CompanyLocation) => (
                    <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} className="rounded-lg">Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={createMutation.isPending || (mode === "email" && !email.trim())}
            className="rounded-lg"
          >
            {createMutation.isPending
              ? mode === "email" ? "Sending..." : "Generating..."
              : mode === "email" ? "Send Invitation" : "Generate Code"
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
