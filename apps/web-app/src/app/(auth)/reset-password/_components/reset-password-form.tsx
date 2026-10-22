"use client"

import { useState } from "react"
import Link from "next/link"
import { useTranslation } from "react-i18next"
import { Lock, CheckCircle, Eye, EyeOff, KeyRound } from "lucide-react"
import { Button, Input, Label } from "@/components/ui"
import { cn } from "@/lib/utils"

/** The new-password form, and what shows once the password is changed. */
// ============================================================================
// Form Component
// ============================================================================

interface ResetPasswordFormProps {
  password: string
  confirmPassword: string
  setPassword: (password: string) => void
  setConfirmPassword: (confirmPassword: string) => void
  showPassword: boolean
  showConfirmPassword: boolean
  setShowPassword: (show: boolean) => void
  setShowConfirmPassword: (show: boolean) => void
  errors: { password?: string; confirmPassword?: string }
  isLoading: boolean
  onSubmit: (e: React.FormEvent) => void
}

export function ResetPasswordForm({
  password,
  confirmPassword,
  setPassword,
  setConfirmPassword,
  showPassword,
  showConfirmPassword,
  setShowPassword,
  setShowConfirmPassword,
  errors,
  isLoading,
  onSubmit,
}: ResetPasswordFormProps) {
  const { t } = useTranslation()
  const [passwordFocused, setPasswordFocused] = useState(false)
  const [confirmFocused, setConfirmFocused] = useState(false)

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {/* New Password */}
      <div className="space-y-2">
        <Label htmlFor="password" className="text-sm font-medium text-slate-700">
          {t("auth.resetPassword.newPasswordLabel")}
        </Label>
        <div className={cn("relative transition-transform duration-200", passwordFocused && "scale-[1.02]")}>
          <Lock
            className={cn(
              "absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors duration-200",
              passwordFocused ? "text-brand-600" : "text-slate-400",
            )}
          />
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            placeholder={t("auth.resetPassword.newPasswordPlaceholder")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onFocus={() => setPasswordFocused(true)}
            onBlur={() => setPasswordFocused(false)}
            className={cn(
              "pl-10 pr-10 h-11 text-sm transition-all duration-200",
              errors.password && "border-error focus-visible:ring-error",
              passwordFocused && "border-brand-600 ring-2 ring-brand-100",
            )}
            disabled={isLoading}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        {errors.password && <p className="text-xs text-error animate-fade-in">{errors.password}</p>}
      </div>

      {/* Confirm Password */}
      <div className="space-y-2">
        <Label htmlFor="confirmPassword" className="text-sm font-medium text-slate-700">
          {t("auth.resetPassword.confirmPasswordLabel")}
        </Label>
        <div className={cn("relative transition-transform duration-200", confirmFocused && "scale-[1.02]")}>
          <Lock
            className={cn(
              "absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors duration-200",
              confirmFocused ? "text-brand-600" : "text-slate-400",
            )}
          />
          <Input
            id="confirmPassword"
            type={showConfirmPassword ? "text" : "password"}
            placeholder={t("auth.resetPassword.confirmPasswordPlaceholder")}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            onFocus={() => setConfirmFocused(true)}
            onBlur={() => setConfirmFocused(false)}
            className={cn(
              "pl-10 pr-10 h-11 text-sm transition-all duration-200",
              errors.confirmPassword && "border-error focus-visible:ring-error",
              confirmFocused && "border-brand-600 ring-2 ring-brand-100",
            )}
            disabled={isLoading}
          />
          <button
            type="button"
            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
          >
            {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        {errors.confirmPassword && <p className="text-xs text-error animate-fade-in">{errors.confirmPassword}</p>}
      </div>

      {/* Password Requirements */}
      <div className="text-xs text-slate-500 space-y-1">
        <p className="font-medium">{t("auth.resetPassword.passwordMust")}</p>
        <ul className="list-disc list-inside space-y-0.5">
          <li>{t("auth.resetPassword.atLeast8Chars")}</li>
          <li>{t("auth.resetPassword.atLeastOneUppercase")}</li>
          <li>{t("auth.resetPassword.atLeastOneLowercase")}</li>
          <li>{t("auth.resetPassword.atLeastOneNumber")}</li>
        </ul>
      </div>

      <Button
        type="submit"
        disabled={isLoading}
        className={cn(
          "relative w-full h-11 bg-gradient-to-r from-brand-600 to-brand-500 " +
            "hover:from-brand-700 hover:to-brand-600 text-white font-semibold text-sm " +
            "rounded-lg transition-all duration-300 border-0 shadow-sm " +
            "hover:shadow-md hover:shadow-brand-600/20",
          !isLoading && "active:scale-[0.98]",
        )}
      >
        {isLoading ? (
          <LoadingSpinner />
        ) : (
          <>
            <KeyRound className="w-4 h-4 mr-2" />
            {t("auth.resetPassword.submitButton")}
          </>
        )}
      </Button>
    </form>
  )
}

// ============================================================================
// Success State Component
// ============================================================================

export function SuccessState() {
  const { t } = useTranslation()
  return (
    <div className="space-y-6">
      {/* Success Icon */}
      <div className="flex justify-center">
        <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center animate-in zoom-in duration-300">
          <CheckCircle className="w-8 h-8 text-success" />
        </div>
      </div>

      {/* Success Message */}
      <div className="bg-slate-50 rounded-lg p-4 text-center">
        <p className="text-sm text-slate-600">{t("auth.resetPassword.successMessage")}</p>
        <p className="text-sm text-slate-500 mt-2">{t("auth.resetPassword.redirectMessage")}</p>
      </div>

      {/* Manual Login Button */}
      <Link href="/login">
        <Button variant="outline" className="w-full h-11">
          {t("auth.resetPassword.signInNow")}
        </Button>
      </Link>
    </div>
  )
}

// ============================================================================
// Loading Spinner
// ============================================================================

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center">
      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
    </div>
  )
}
