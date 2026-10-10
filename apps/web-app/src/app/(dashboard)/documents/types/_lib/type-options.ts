import { Ban, CheckCheck, PenLine, Printer } from "lucide-react"
import type { StarterDocumentType } from "@hbcfield/shared/client"

/* The fixed choices the document-type editor offers, and the payload rules it sends. */

export const CADENCES = ["ONE_OFF", "MONTHLY", "ANNUAL"] as const
export const DIRECTIONS = ["ISSUED", "SUPPLIED", "BOTH"] as const

export const SIGN_MODES = [
  { key: "NONE", Icon: Ban },
  { key: "ACKNOWLEDGE", Icon: CheckCheck },
  { key: "IN_APP", Icon: PenLine },
  { key: "WET_INK", Icon: Printer },
] as const

/** Retention offered in years, because nobody thinks in months. */
export const RETENTION_YEARS = [3, 5, 7, 10, 30] as const

/**
 * Requirement fields, and only for a type that can carry them.
 *
 * An ISSUED type always sends false/[]: switching a type from supplied to
 * issued is impossible after creation, but a draft can be switched before
 * saving, and half-set state left behind would require a payslip from everyone.
 */
export function requirementPayload(direction: string, all: boolean, roleIds: string[]) {
  // Only what a member can hand in may be required of them — SUPPLIED or BOTH.
  if (direction === "ISSUED") return { requiredFromAll: false, requiredFromRoleIds: [] }
  return {
    requiredFromAll: all && roleIds.length === 0,
    requiredFromRoleIds: all ? [] : roleIds,
  }
}

/** The empty starter. Not in the shared list — it is a UI affordance, not a type. */
export const BLANK: StarterDocumentType = {
  key: "",
  label: "",
  description: "",
  cadence: "ONE_OFF",
  direction: "ISSUED",
  signatureMode: "NONE",
  isCredential: false,
  hasExpiry: false,
  twoSided: false,
  scanShape: "CARD",
  retentionMonths: null,
}
