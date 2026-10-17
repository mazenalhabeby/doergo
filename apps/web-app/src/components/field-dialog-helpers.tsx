"use client"

import { Hash, Calendar, Link2, Mail, CheckSquare, Type, ChevronDown } from "lucide-react"
import { type CustomFieldType } from "@/lib/api"

/** FieldDialog's module-level helpers, moved here unchanged so its sections can read them too. */
export const FIELD_TYPES: { value: CustomFieldType; labelKey: string; icon: typeof Type }[] = [
  { value: "TEXT", labelKey: "customFields.fieldTypes.TEXT", icon: Type },
  { value: "NUMBER", labelKey: "customFields.fieldTypes.NUMBER", icon: Hash },
  { value: "DATE", labelKey: "customFields.fieldTypes.DATE", icon: Calendar },
  { value: "DROPDOWN", labelKey: "customFields.fieldTypes.DROPDOWN", icon: ChevronDown },
  { value: "CHECKBOX", labelKey: "customFields.fieldTypes.CHECKBOX", icon: CheckSquare },
  { value: "URL", labelKey: "customFields.fieldTypes.URL", icon: Link2 },
  { value: "EMAIL", labelKey: "customFields.fieldTypes.EMAIL", icon: Mail },
]
