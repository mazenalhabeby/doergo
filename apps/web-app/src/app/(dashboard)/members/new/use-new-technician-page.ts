"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { notify } from "@/lib/toast"
import { useTranslation } from "react-i18next"
import { useAuth } from "@/contexts/auth-context"
import { employeesApi, type CreateEmployeeInput } from "@/lib/api"
import { copyText } from "@/lib/clipboard"
import { keys } from "@/lib/query-keys"

/** NewTechnicianPage's state and handlers — everything before its markup, moved here unchanged. */
export function useNewTechnicianPage() {
  const router = useRouter()
  const { t } = useTranslation()
  const { user, hasPermission } = useAuth()
  const queryClient = useQueryClient()

  // Form state
  const [email, setEmail] = useState("")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [password, setPassword] = useState("")
  const [position, setPosition] = useState<string>("technician")
  const [specialty, setSpecialty] = useState("")

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
      queryClient.invalidateQueries({ queryKey: keys.employees.all() })
      if (response?.generatedPassword) {
        setGeneratedPassword(response.generatedPassword)
        setSuccessDialog(true)
      } else {
        notify.success(t('technicians.create.successMessage'))
        router.push("/members")
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
    })
  }

  // Copy password handler
  const handleCopyPassword = async () => {
    if (generatedPassword) {
      if (!(await copyText(generatedPassword))) return
      setCopiedPassword(true)
      setTimeout(() => setCopiedPassword(false), 2000)
    }
  }

  // Close success dialog
  const handleCloseSuccess = () => {
    setSuccessDialog(false)
    router.push("/members")
  }

  // Check if user can create employees (ADMIN or can-view-all-tasks)
  const canCreateEmployees = user?.role === "ADMIN" || hasPermission('canViewAllTasks')

  return {
    t,
    email,
    setEmail,
    firstName,
    setFirstName,
    lastName,
    setLastName,
    password,
    setPassword,
    position,
    setPosition,
    specialty,
    setSpecialty,
    showPassword,
    setShowPassword,
    isSubmitting,
    successDialog,
    setSuccessDialog,
    generatedPassword,
    copiedPassword,
    isFormValid,
    handleSubmit,
    handleCopyPassword,
    handleCloseSuccess,
    canCreateEmployees,
  }
}

/** What NewTechnicianPage and its sections read. */
export type NewTechnicianPageState = ReturnType<typeof useNewTechnicianPage>
