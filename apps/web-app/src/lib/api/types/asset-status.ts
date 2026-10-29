export type AssetStatus = "ACTIVE" | "INACTIVE" | "MAINTENANCE" | "RETIRED"

export interface AssetCategory {
  id: string
  name: string
  description: string | null
  icon: string | null
  color: string | null
  organizationId: string
  spaceId?: string | null
  /** What this kind's records look like — read via normalizeKindShape(). */
  config?: unknown
  createdAt: string
  updatedAt: string
  _count?: {
    types: number
    assets: number
  }
}

export interface AssetType {
  id: string
  name: string
  description: string | null
  categoryId: string
  createdAt: string
  updatedAt: string
  category?: AssetCategory
  _count?: {
    assets: number
  }
}

export interface Asset {
  id: string
  name: string
  serialNumber: string | null
  model: string | null
  manufacturer: string | null
  status: AssetStatus
  installDate: string | null
  warrantyExpiry: string | null
  locationAddress: string | null
  locationLat: number | null
  locationLng: number | null
  notes: string | null
  organizationId: string
  categoryId: string | null
  typeId: string | null
  createdAt: string
  updatedAt: string
  category?: AssetCategory | null
  type?: AssetType | null
  _count?: {
    tasks: number
  }
}

export interface MaintenanceHistoryItem {
  id: string
  title: string
  status: string
  priority: string
  completedAt: string | null
  createdAt: string
  assignedTo: {
    id: string
    firstName: string
    lastName: string
  } | null
  // Duration calculated from events or route data
  duration?: number | null
}

export interface AssetListRow {
  id: string
  list: string
  values: Record<string, string>
  position: number
}

/** RECORDED counts. SUBMITTED is waiting on the office. REJECTED never counts. */
export type AssetExpenseStatus = "RECORDED" | "SUBMITTED" | "REJECTED"

export interface AssetMoneyEntry {
  id: string
  category: string
  direction: "IN" | "OUT"
  amountCents: number
  note: string | null
  occurredAt: string
  authorId: string | null
  status?: AssetExpenseStatus
  reviewNote?: string | null
  /** Whether a slip is attached — never the key, and never a URL. */
  hasReceipt?: boolean
  /**
   * The logbook type this row is ("fuel", "damage"). `null`/absent — and
   * `cost` from the logbook routes — is the ledger itself. A logbook entry with
   * no money has `amountCents: 0` and says what it is through this.
   */
  logType?: string | null
}

/** One logbook entry, as the logbook routes return it. */
export interface AssetLogEntry extends AssetMoneyEntry {
  assetId: string
  logType: string
  /** Answers keyed by FIELD key. Money and photo live in amountCents / hasReceipt. */
  values: Record<string, string | number> | null
  reviewedAt?: string | null
  author?: CustodyHolderRef | null
  createdAt: string
}

export interface AssetLogPage {
  entries: AssetLogEntry[]
  nextCursor: string | null
}

/** Where one type of work stands, as the server computed it NOW. */
export interface AssetLogDue {
  key: string
  label: string
  color: string
  lastEntryId: string
  lastDoneAt: string
  lastReading: number | null
  meterKey: string | null
  dueAt: string | null
  dueReading: number | null
  remindAt: string | null
  remindReading: number | null
  unit: string | null
  reading: number | null
  stage: "ok" | "soon" | "overdue"
  progress: number
  daysLeft: number | null
  unitsLeft: number | null
}

export interface AssetLogCredit {
  inCents: number
  outCents: number
  netCents: number
  entries: number
}

export interface AssetLogSummary {
  period: { from: string; to: string }
  readings: Record<string, { value: number; at: string; entryId: string }>
  due: AssetLogDue[]
  waitingCount: number
  byAuthor: Array<AssetLogCredit & { authorId: string | null; author: CustodyHolderRef | null }>
  byType: Array<AssetLogCredit & { logType: string; label: string; color: string }>
}

export interface CreateAssetLogInput {
  /** Made here, so a double click files one entry. */
  entryId?: string
  logType: string
  values: Record<string, string | number>
  note?: string
  occurredAt?: string
  receiptKey?: string
  receiptName?: string
  receiptMime?: string
}

export interface AssetMoneySummary {
  entries: AssetMoneyEntry[]
  totals: {
    inCents: number
    outCents: number
    netCents: number
    /** Sent from a phone, in no total until somebody accepts it. */
    waitingCount?: number
    waitingCents?: number
  }
}

/** One party of a custody period — a member, or a client. */
export interface CustodyHolderRef {
  id: string
  firstName?: string
  lastName?: string
  name?: string
  email?: string | null
  avatarUrl?: string | null
}

/**
 * One stretch during which one party held one asset.
 *
 * `endedAt: null` means they hold it now. `totals` is what the asset cost
 * DURING this period — computed from the dates, never stored against a holder.
 */
export interface CustodyPeriodDto {
  id: string
  assetId: string
  userId: string | null
  customerId: string | null
  startedAt: string
  endedAt: string | null
  reason: string | null
  user?: CustodyHolderRef | null
  customer?: CustodyHolderRef | null
  totals: { inCents: number; outCents: number; netCents: number; entries: number }
  asset?: {
    id: string
    name: string
    status: AssetStatus
    serialNumber?: string | null
    model?: string | null
    manufacturer?: string | null
    category?: AssetCategory | null
  }
}

export interface CustodyTimeline {
  periods: CustodyPeriodDto[]
  /** Money that falls in no period — real, and deliberately not hidden. */
  unattributed: { inCents: number; outCents: number; netCents: number; entries: number }
  /** The zone the record's days are read in — a receipt carries a day (`entryHolder`). */
  timeZone?: string
}

/** What a reader made of a contract, before a person corrects it. */
export interface ContractReading {
  registration?: { value: string; confidence: "certain" | "likely"; raw: string }
  vin?: { value: string; confidence: "certain" | "likely"; raw: string }
  serial?: { value: string; confidence: "certain" | "likely"; raw: string }
  manufacturer?: { value: string; confidence: "certain" | "likely"; raw: string }
  model?: { value: string; confidence: "certain" | "likely"; raw: string }
  startsOn?: { value: string; confidence: "certain" | "likely"; raw: string }
  endsOn?: { value: string; confidence: "certain" | "likely"; raw: string }
  lines: string[]
}

/** The corrected reading — what the server is actually sent. */
export interface ContractFields {
  name?: string
  registration?: string
  vin?: string
  serial?: string
  manufacturer?: string
  model?: string
  startsOn?: string
  endsOn?: string
}

export type ContractStep =
  | {
      kind: "create"
      asset: {
        name: string
        serialNumber?: string
        model?: string
        manufacturer?: string
        details: Array<{ label: string; value: string }>
      }
    }
  | { kind: "hand-over"; startsOn?: string }
  | { kind: "close"; assetId: string; assetName: string }
  | { kind: "retire"; assetId: string; assetName: string }

export interface ContractPreview {
  asset: {
    name: string
    serialNumber?: string
    model?: string
    manufacturer?: string
    details: Array<{ label: string; value: string }>
  }
  steps: ContractStep[]
  problems: Array<{ kind: "no-name" | "no-holder" }>
  canApply: boolean
  startsAt: string
  /** The term begins later than today, so custody is recorded from today. */
  startClamped: boolean
  /** The term began before what it replaces was handed over, or too long ago — custody starts later. */
  startRaised?: boolean
}

export interface ContractProposalInput {
  categoryId: string
  typeId?: string
  holderUserId: string
  fields: ContractFields
  retireReplaced?: boolean
}
