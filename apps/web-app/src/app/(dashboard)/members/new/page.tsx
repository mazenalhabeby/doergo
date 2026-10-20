"use client"

import Link from "next/link"
import { ArrowLeft, Copy, Check } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { useNewTechnicianPage } from "./use-new-technician-page"
import { NewTechnicianPageCreate } from "./new-technician-page-create"

export default function NewTechnicianPage() {
  const vm = useNewTechnicianPage()
  const {
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
  } = vm

  if (!canCreateEmployees) {
    return (
      <div className="max-w-screen-xl mx-auto px-6 py-8 space-y-6">
        <Link href="/members">
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
      <Link href="/members">
        <Button variant="ghost" size="sm" className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          {t('technicians.create.backToTechnicians')}
        </Button>
      </Link>

      {/* Form */}
      <NewTechnicianPageCreate vm={vm} />

      {/* Success Dialog with Generated Password */}
      <ConfirmDialog
        open={successDialog}
        onOpenChange={setSuccessDialog}
        titleClassName="flex items-center gap-2 text-green-600"
        title={
          <>
            <Check className="h-5 w-5" />
            {t('technicians.createSuccess.title')}
          </>
        }
        descriptionClassName="space-y-4"
        description={
          <>
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
          </>
        }
        cancelLabel={null}
        confirmLabel={t('common.done')}
        onConfirm={handleCloseSuccess}
      />
    </div>
  )
}
