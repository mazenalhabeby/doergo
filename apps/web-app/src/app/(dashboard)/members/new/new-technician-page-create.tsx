"use client"

import Link from "next/link"
import { UserPlus, Eye, EyeOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { SPECIALTY_OPTIONS } from "./new-technician-page-helpers"
import type { NewTechnicianPageState } from "./use-new-technician-page"

/** Part of NewTechnicianPage's markup, moved here unchanged; it reads the page's state from `vm`. */
export function NewTechnicianPageCreate({ vm }: { vm: NewTechnicianPageState }) {
  const {
    t,
    handleSubmit,
    firstName,
    setFirstName,
    lastName,
    setLastName,
    email,
    setEmail,
    showPassword,
    password,
    setPassword,
    setShowPassword,
    position,
    setPosition,
    specialty,
    setSpecialty,
    isFormValid,
    isSubmitting,
  } = vm
  return (
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

          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Link href="/members">
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
  )
}
