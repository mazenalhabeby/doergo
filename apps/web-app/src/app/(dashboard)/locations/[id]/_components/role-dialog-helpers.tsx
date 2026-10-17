"use client"

import { SPACE_PERMISSIONS } from "./use-role-dialog"

/** RoleDialog's module-level helpers, moved here unchanged so its sections can read them too. */
/** Grouped by domain, so twenty checkboxes read as five short subjects. */
export const SPACE_PERMISSION_DOMAINS = [...new Set(SPACE_PERMISSIONS.map((p) => p.domain))]
