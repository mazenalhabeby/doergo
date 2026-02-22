"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, UserPlus, Eye, EyeOff, Copy, Check } from "lucide-react"
import { toast } from "sonner"

import { useAuth } from "@/contexts/auth-context"
import {
  techniciansApi,
  type CreateTechnicianInput,
  TechnicianType,
  WorkMode,
} from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

// Specialty options
const SPECIALTY_OPTIONS = [
  { value: "Electrical", label: "Electrical" },
  { value: "Plumbing", label: "Plumbing" },
  { value: "Mechanical", label: "Mechanical" },
  { value: "HVAC", label: "HVAC" },
  { value: "General", label: "General" },
  { value: "Other", label: "Other" },
] as const

export default function NewTechnicianPage() {
  const router = useRouter()
  const { user } = useAuth()
  const queryClient = useQueryClient()

  // Form state
  const [email, setEmail] = useState("")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [password, setPassword] = useState("")
  const [technicianType, setTechnicianType] = useState<TechnicianType>(
    TechnicianType.FREELANCER
  )
  const [workMode, setWorkMode] = useState<WorkMode>(WorkMode.HYBRID)
  const [specialty, setSpecialty] = useState("")
  const [maxDailyJobs, setMaxDailyJobs] = useState(5)

  // UI state
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [successDialog, setSuccessDialog] = useState(false)
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null)
  const [copiedPassword, setCopiedPassword] = useState(false)

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: CreateTechnicianInput) => techniciansApi.create(data),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ["technicians"] })
      if (response?.generatedPassword) {
        setGeneratedPassword(response.generatedPassword)
        setSuccessDialog(true)
      } else {
        toast.success("Technician created successfully")
        router.push("/technicians")
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to create technician")
      setIsSubmitting(false)
    },
  })

  // Form validation
  const isFormValid =
    email.trim() !== "" &&
    firstName.trim() !== "" &&
    lastName.trim() !== ""

  // Submit handler
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!isFormValid) {
      toast.error("Please fill in all required fields")
      return
    }

    setIsSubmitting(true)
    createMutation.mutate({
      email: email.trim(),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      password: password.trim() || undefined,
      technicianType,
      workMode,
      specialty: specialty || undefined,
      maxDailyJobs,
    })
  }

  // Copy password handler
  const handleCopyPassword = async () => {
    if (generatedPassword) {
      await navigator.clipboard.writeText(generatedPassword)
      setCopiedPassword(true)
      setTimeout(() => setCopiedPassword(false), 2000)
    }
  }

  // Close success dialog
  const handleCloseSuccess = () => {
    setSuccessDialog(false)
    router.push("/technicians")
  }

  // Check if user can create technicians (ADMIN or DISPATCHER)
  const canCreateTechnicians = user?.role === "ADMIN" || user?.role === "DISPATCHER"
  if (!canCreateTechnicians) {
    return (
      <div className="max-w-screen-xl mx-auto px-6 py-8 space-y-6">
        <Link href="/technicians">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Technicians
          </Button>
        </Link>
        <Card>
          <CardContent className="py-12 text-center">
            <h3 className="text-lg font-medium text-slate-800 mb-2">
              Access Denied
            </h3>
            <p className="text-sm text-slate-500">
              You don't have permission to create technicians.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-screen-xl mx-auto px-6 py-8 space-y-6">
      {/* Back button */}
      <Link href="/technicians">
        <Button variant="ghost" size="sm" className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Technicians
        </Button>
      </Link>

      {/* Form */}
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Add New Technician
          </CardTitle>
          <CardDescription>
            Create a new technician account. They will receive login credentials
            to access the mobile app.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Basic Info */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-slate-700">
                Basic Information
              </h3>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">
                    First Name <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="firstName"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="John"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">
                    Last Name <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="lastName"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Doe"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">
                  Email Address <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="john.doe@example.com"
                  required
                />
                <p className="text-xs text-slate-500">
                  This will be used as their login username
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password (Optional)</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Leave blank to auto-generate"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-slate-500">
                  If left blank, a secure password will be generated and shown
                  after creation
                </p>
              </div>
            </div>

            {/* Work Details */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-slate-700">
                Work Details
              </h3>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="type">Employment Type</Label>
                  <Select
                    value={technicianType}
                    onValueChange={(v) => setTechnicianType(v as TechnicianType)}
                  >
                    <SelectTrigger id="type">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={TechnicianType.FREELANCER}>
                        Freelancer
                      </SelectItem>
                      <SelectItem value={TechnicianType.FULL_TIME}>
                        Full-Time Employee
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-slate-500">
                    Determines billing and expense coverage
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="workMode">Work Mode</Label>
                  <Select
                    value={workMode}
                    onValueChange={(v) => setWorkMode(v as WorkMode)}
                  >
                    <SelectTrigger id="workMode">
                      <SelectValue placeholder="Select work mode" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={WorkMode.HYBRID}>
                        Hybrid (On-Site + On-Road)
                      </SelectItem>
                      <SelectItem value={WorkMode.ON_SITE}>
                        On-Site (Company Locations)
                      </SelectItem>
                      <SelectItem value={WorkMode.ON_ROAD}>
                        On-Road (Field Tasks Only)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-slate-500">
                    On-Site: attendance tracking, On-Road: task-based, Hybrid: both
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="specialty">Specialty</Label>
                  <Select value={specialty} onValueChange={setSpecialty}>
                    <SelectTrigger id="specialty">
                      <SelectValue placeholder="Select specialty" />
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
              </div>

              <div className="space-y-2">
                <Label htmlFor="maxJobs">Max Daily Jobs</Label>
                <Input
                  id="maxJobs"
                  type="number"
                  min={1}
                  max={20}
                  value={maxDailyJobs}
                  onChange={(e) => setMaxDailyJobs(parseInt(e.target.value) || 5)}
                />
                <p className="text-xs text-slate-500">
                  Maximum number of tasks this technician can be assigned per
                  day (1-20)
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Link href="/technicians">
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </Link>
              <Button
                type="submit"
                disabled={!isFormValid || isSubmitting}
                className="gap-2"
              >
                {isSubmitting ? (
                  "Creating..."
                ) : (
                  <>
                    <UserPlus className="h-4 w-4" />
                    Create Technician
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Success Dialog with Generated Password */}
      <AlertDialog open={successDialog} onOpenChange={setSuccessDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-green-600">
              <Check className="h-5 w-5" />
              Technician Created Successfully
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-4">
              <p>
                The technician account has been created. Please share the
                following login credentials with them:
              </p>
              <div className="bg-slate-50 rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Email:</span>
                  <span className="font-mono text-sm">{email}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Password:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm">{generatedPassword}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={handleCopyPassword}
                    >
                      {copiedPassword ? (
                        <Check className="h-4 w-4 text-green-600" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
              <p className="text-amber-600 text-sm">
                Make sure to save this password now. It won't be shown again.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={handleCloseSuccess}>
              Done
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
