"use client"

import { keys } from "@/lib/query-keys"
import { useState, useEffect, useMemo } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Loader2,
  Tag,
  Building2,
  Globe,
  Phone,
  Mail,
  Link2,
  MapPin,
  Clock,
  Image as ImageIcon,
  Upload,
  Trash2,
  Receipt,
} from "lucide-react"
import { notify } from "@/lib/toast"
import { allTimezones, tzOffset } from "@/lib/timezones"
import { useTranslation } from "react-i18next"
import { useAuth } from "@/contexts/auth-context"
import { SettingCard } from "./setting-card"
import { organizationsApi, rateHistoryApi } from "@/lib/api"
import { DatedRateField } from "@/components/rates/dated-rate"
import { CurrencySetting } from "@/components/rates/currency-setting"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Combobox, type ComboboxOption } from "@/components/ui/combobox"
import { PhoneInput } from "@/components/ui/phone-input"
import { getCountries } from "@/lib/countries"
import { resizeImageToDataUrl } from "../_lib/resize-image"
import { FormField, SaveBar } from "./settings-form-bits"
import { useGeneralSection } from "./use-general-section"
import { GeneralSectionGeneral } from "./general-section-general"

export function GeneralSection() {
  const vm = useGeneralSection()
  const {
    t,
    refreshUser,
    profile,
    isLoading,
    form,
    setForm,
    updateMutation,
    set,
    orgRates,
    saveOrgRate,
    logoBusy,
    saveLogo,
    onLogoPick,
    industryOptions,
    timezoneOptions,
    countryOptions,
  } = vm

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-[400px] w-full rounded-2xl" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <GeneralSectionGeneral vm={vm} />
    </div>
  )
}
