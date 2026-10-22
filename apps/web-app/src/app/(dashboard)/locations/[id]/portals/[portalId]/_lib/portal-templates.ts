"use client"

import { type PortalCategoryInput } from "@/lib/api"

/** The portal types offered and an empty category, moved here unchanged. */
export const TEMPLATES = [
  { key: "rental", label: "Rental / Property", badge: "Rental", accent: "emerald" },
  { key: "logistics", label: "Logistics / Delivery", badge: "Logistics", accent: "orange" },
  { key: "workplace", label: "Workplace / Facilities", badge: "Workplace", accent: "cyan" },
]

export const TPL_BY_KEY = Object.fromEntries(TEMPLATES.map((x) => [x.key, x]))

export const EMPTY_CAT: PortalCategoryInput = {
  label: "",
  icon: "plus",
  color: "slate",
  urgent: false,
  team: "",
  issues: [],
}
