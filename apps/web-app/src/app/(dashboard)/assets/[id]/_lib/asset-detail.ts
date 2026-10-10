import type { AssetCategory } from "@/lib/api"

/** Steps that mean a job is over — finished, closed or called off. */
export const DONE = ["COMPLETED", "CLOSED", "CANCELED"]

export interface AssetDetail {
  id: string
  name: string
  locationAddress?: string | null
  locationLat?: number | null
  locationLng?: number | null
  holderUserId?: string | null
  /** Everyone who holds it. One entry, or several when the type allows it. */
  holders?: Array<{
    id: string
    userId?: string | null
    customerId?: string | null
    user?: { id: string; firstName: string; lastName: string; email?: string | null } | null
    customer?: { id: string; name: string; email?: string | null; phone?: string | null } | null
  }>
  customer?: { id: string; name: string; email?: string | null; phone?: string | null } | null
  details?: unknown
  category?: AssetCategory | null
  status?: string | null
  serialNumber?: string | null
  manufacturer?: string | null
  model?: string | null
  installDate?: string | null
  warrantyExpiry?: string | null
  notes?: string | null
}
