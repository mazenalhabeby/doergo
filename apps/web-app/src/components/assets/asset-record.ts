// One record of a kind as the record dialog holds it: its plate (facts) and its holders.
import { encodeHolderList, type HolderKey } from "./holder-picker"

/** One record of a kind — an apartment, a van. */
export interface AssetRecord {
  id: string
  name: string
  serialNumber?: string | null
  locationAddress?: string | null
  locationLat?: number | null
  locationLng?: number | null
  holderUserId?: string | null
  customerId?: string | null
  /** Who holds it. One entry, or several when the type allows it. */
  holders?: Array<{ userId?: string | null; customerId?: string | null }>
  details?: unknown
  status?: string | null
  manufacturer?: string | null
  model?: string | null
  installDate?: string | null
  warrantyExpiry?: string | null
  notes?: string | null
  _count?: { tasks?: number }
}

/** A stored date -> what `<input type="date">` holds. */
const dayOf = (v?: string | null) => (v ? v.slice(0, 10) : "")

/** The plate as the form holds it: every fact a string, empty meaning unset. */
export const factsOf = (r?: AssetRecord) => ({
  serialNumber: r?.serialNumber ?? "",
  manufacturer: r?.manufacturer ?? "",
  model: r?.model ?? "",
  installDate: dayOf(r?.installDate),
  warrantyExpiry: dayOf(r?.warrantyExpiry),
  notes: r?.notes ?? "",
})

export type Facts = ReturnType<typeof factsOf>

export const hasFacts = (f: Facts) => Object.values(f).some((v) => v.trim() !== "")

/*
  A holder is one string: "u:<userId>" or "c:<customerId>".

  One encoding for both sides keeps selection a set-membership test instead of
  two parallel lists that can disagree about who is chosen — and makes the
  single case a list of length one rather than a separate code path.
*/
export const encodeHolders = (r?: AssetRecord): HolderKey[] => {
  if (r?.holders?.length) return encodeHolderList(r.holders)
  // A record saved before types could hold several still answers the old way.
  if (r?.holderUserId) return [`u:${r.holderUserId}`]
  if (r?.customerId) return [`c:${r.customerId}`]
  return []
}

/**
 * What a save sends for the plate.
 *
 * An emptied box is sent as null, not "": null clears the fact, while an empty
 * string stored in its place reads as "has a serial number, and it is blank".
 * On a new record an empty box is simply not sent.
 */
export function factsPayload(facts: Facts, editing: boolean): Record<string, string | null> {
  const out: Record<string, string | null> = {}
  for (const key of Object.keys(facts) as Array<keyof Facts>) {
    const value = facts[key].trim()
    if (value) out[key] = value
    else if (editing) out[key] = null
  }
  return out
}
