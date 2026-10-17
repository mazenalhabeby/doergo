"use client"

import { serializeAccessDraft } from "@hbcfield/shared/client"
import type { AccessDraft } from "@hbcfield/shared/client"

/** Parts moved here unchanged from access-builder.tsx (line length pass). */
/** Stable, order-insensitive canonical form of a draft's PERSISTED shape — so
 *  dirty tracking ignores field ordering and collapsed values (e.g. task scope
 *  when create is off). Reuses `serializeAccessDraft` (single source of truth). */
export function canon(d: AccessDraft): string {
  const p = serializeAccessDraft(d)
  return JSON.stringify({
    ...p,
    systemRole: d.systemRole, // role tier isn't in the persisted shape — track it explicitly
    enabledModules: { ...p.enabledModules, modules: [...p.enabledModules.modules].sort() },
    contactAllowedIds: [...p.contactAllowedIds].sort(),
  })
}
