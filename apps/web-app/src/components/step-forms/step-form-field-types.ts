import {
  AlignLeft,
  Calendar,
  CircleDot,
  Hash,
  Image as ImageIcon,
  PenLine,
  ToggleLeft,
  Type,
  type LucideIcon,
} from "lucide-react"
import type { StepFormFieldType } from "@hbcfield/shared/client"

/** Each kind of question: its icon, and its name when no translation exists. */
export const FIELD_TYPE_ICON: Record<StepFormFieldType, LucideIcon> = {
  note: AlignLeft,
  choice: CircleDot,
  photos: ImageIcon,
  signature: PenLine,
  name: Type,
  number: Hash,
  yesno: ToggleLeft,
  date: Calendar,
}

export const TYPE_NAME: Record<StepFormFieldType, string> = {
  note: "Note",
  choice: "Choice",
  photos: "Photos",
  signature: "Signature",
  name: "Name",
  number: "Number",
  yesno: "Yes / no",
  date: "Date",
}
