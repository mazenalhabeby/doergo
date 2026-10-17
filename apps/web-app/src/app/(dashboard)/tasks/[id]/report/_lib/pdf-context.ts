import type { TaskReport, TaskReportSignature } from "@hbcfield/shared/client"

import { PDF_PALETTE, type LoadedImage, type Rgb } from "@/lib/pdf-common"

import type { NumberedSection, Translate } from "./report-model"

/** What every section of the job report PDF reads — built once by the builder. */
export interface ReportCtx {
  r: TaskReport
  t: Translate
  locale: string
  tz: string | null
  when: (iso: string | null | undefined) => string
  numbers: Partial<Record<NumberedSection, number>>
  showPrices: boolean
  photoImgs: Map<string, LoadedImage | null>
  sigImgs: Map<TaskReportSignature, LoadedImage | null>
}

export const TIME_TONE: Record<"travel" | "working" | "blocked", Rgb> = {
  travel: { r: 14, g: 165, b: 233 }, // sky-500
  working: { r: 34, g: 197, b: 94 }, // green-500
  blocked: { r: 245, g: 158, b: 11 }, // amber-500
}

export function hexToRgb(hex: string): Rgb {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return PDF_PALETTE.MUTED
  const n = parseInt(m[1]!, 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}
