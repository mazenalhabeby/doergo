"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, UserPlus, Eye, EyeOff, Copy, Check } from "lucide-react"
import { notify } from "@/lib/toast"

import { useTranslation } from "react-i18next"
import { useAuth } from "@/contexts/auth-context"
import {
  employeesApi,
  type CreateEmployeeInput,

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
  const { t } = useTranslation()
  const { user } = useAuth()
  const queryClient = useQueryClient()

  // Form state
  const [email, setEmail] = useState("")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [password, setPassword] = useState("")
  const [position, setPosition] = useState<string>("technician")
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
    mutationFn: (data: CreateEmployeeInput) => employeesApi.create(data),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ["employees"] })
      if (response?.generatedPassword) {
        setGeneratedPassword(response.generatedPassword)
        setSuccessDialog(true)
      } else {
        notify.success(t('technicians.create.successMessage'))
        router.push("/employees")
      }
    },
    onError: (error: Error) => {
      notify.error(error.message || t('technicians.create.failedToCreate'))
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
      notify.error(t('validation.fillRequiredFields'))
      return
    }

    setIsSubmitting(true)
    createMutation.mutate({
      email: email.trim(),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      password: password.trim() || undefined,
      
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
    router.push("/employees")
  }

  // Check if user can create employees (ADMIN or MANAGER)
  const canCreateEmployees = user?.role === "ADMIN" || user?.role === "MANAGER"
  if (!canCreateEmployees) {
    return (
      <div className="max-w-screen-xl mx-auto px-6 py-8 space-y-6">
        <Link href="/employees">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            {t('technicians.create.backToTechnicians')}
          </Button>
        </Link>
        <Card>
          <CardContent className="py-12 text-center">
            <h3 className="text-lg font-medium text-foreground mb-2">
              {t('technicians.create.accessDenied')}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t('technicians.create.noPermission')}
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-screen-xl mx-auto px-6 py-8 space-y-6">
      {/* Back button */}
      <Link href="/employees">
        <Button variant="ghost" size="sm" className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          {t('technicians.create.backToTechnicians')}
        </Button>
      </Link>

      {/* Form */}
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            {t('technicians.create.title')}
          </CardTitle>
          <CardDescription>
            {t('technicians.create.description')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Basic Info */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-foreground">
                {t('technicians.create.basicInformation')}
              </h3>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">
                    {t('technicians.create.firstNameLabel')} <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="firstName"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder={t('employees.new.firstNamePlaceholder')}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">
                    {t('technicians.create.lastNameLabel')} <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="lastName"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder={t('employees.new.lastNamePlaceholder')}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">
                  {t('technicians.create.emailLabel')} <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('employees.new.emailPlaceholder')}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  {t('technicians.create.emailHint')}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">{t('technicians.create.passwordLabel')}</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t('technicians.create.passwordPlaceholder')}
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
                <p className="text-xs text-muted-foreground">
                  {t('technicians.create.passwordHint')}
                </p>
              </div>
            </div>

            {/* Work Details */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-foreground">
                {t('technicians.create.workDetails')}
              </h3>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="position">{t('technicians.create.positionLabel')}</Label>
                  <Input
                    id="position"
                    value={position}
                    onChange={(e) => setPosition(e.target.value)}
                    placeholder={t('employees.new.positionPlaceholder')}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('technicians.create.positionHint')}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="specialty">{t('technicians.create.jobTitleLabel')}</Label>
                  <Input
                    id="specialty"
                    placeholder={t('technicians.create.jobTitlePlaceholder')}
                    value={specialty}
                    onChange={(e) => setSpecialty(e.target.value)}
                    list="specialty-suggestions"
                  />
                  <datalist id="specialty-suggestions">
                    {SPECIALTY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.label} />
                    ))}
                  </datalist>
                  <p className="text-xs text-muted-foreground">
                    {t('technicians.create.jobTitleHint')}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="maxJobs">{t('technicians.create.maxDailyJobsLabel')}</Label>
                <Input
                  id="maxJobs"
                  type="number"
                  min={1}
                  max={20}
                  value={maxDailyJobs}
                  onChange={(e) => setMaxDailyJobs(parseInt(e.target.value) || 5)}
                />
                <p className="text-xs text-muted-foreground">
                  {t('technicians.create.maxDailyJobsHint')}
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Link href="/employees">
                <Button type="button" variant="outline">
                  {t('common.cancel')}
                </Button>
              </Link>
              <Button
                type="submit"
                disabled={!isFormValid || isSubmitting}
                className="gap-2"
              >
                {isSubmitting ? (
                  t('common.creating')
                ) : (
                  <>
                    <UserPlus className="h-4 w-4" />
                    {t('technicians.create.createButton')}
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
              {t('technicians.createSuccess.title')}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-4">
              <p>
                {t('technicians.createSuccess.description')}
              </p>
              <div className="bg-muted rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{t('technicians.createSuccess.emailLabel')}</span>
                  <span className="font-mono text-sm">{email}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{t('technicians.createSuccess.passwordLabel')}</span>
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
                {t('technicians.createSuccess.saveWarning')}
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={handleCloseSuccess}>
              {t('common.done')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
