

// ============================================
// ASSET MANAGEMENT TYPES & API
// ============================================

export type AssetStatus = 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE' | 'RETIRED';


export interface AssetCategory {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  organizationId: string;
  spaceId?: string | null;
  /** What this kind's records look like — read via normalizeKindShape(). */
  config?: unknown;
  createdAt: string;
  updatedAt: string;
  _count?: {
    types: number;
    assets: number;
  };
}


export interface AssetType {
  id: string;
  name: string;
  description: string | null;
  categoryId: string;
  createdAt: string;
  updatedAt: string;
  category?: AssetCategory;
  _count?: {
    assets: number;
  };
}


export interface Asset {
  id: string;
  name: string;
  serialNumber: string | null;
  model: string | null;
  manufacturer: string | null;
  status: AssetStatus;
  installDate: string | null;
  warrantyExpiry: string | null;
  locationAddress: string | null;
  locationLat: number | null;
  locationLng: number | null;
  notes: string | null;
  organizationId: string;
  categoryId: string | null;
  typeId: string | null;
  createdAt: string;
  updatedAt: string;
  category?: AssetCategory | null;
  type?: AssetType | null;
  _count?: {
    tasks: number;
  };
}


export interface MaintenanceHistoryItem {
  id: string;
  title: string;
  status: string;
  priority: string;
  completedAt: string | null;
  createdAt: string;
  assignedTo: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
  routeDistance: number | null;
  // Duration calculated from events or route data
  duration?: number | null;
}


export interface AssetListRow {
  id: string;
  list: string;
  values: Record<string, string>;
  position: number;
}


/** RECORDED counts. SUBMITTED is waiting on the office. REJECTED never counts. */
export type AssetExpenseStatus = 'RECORDED' | 'SUBMITTED' | 'REJECTED';


export interface AssetMoneyEntry {
  id: string;
  category: string;
  direction: 'IN' | 'OUT';
  amountCents: number;
  note: string | null;
  occurredAt: string;
  authorId: string | null;
  status?: AssetExpenseStatus;
  reviewNote?: string | null;
  /** Whether a slip is attached — never the key, and never a URL. */
  hasReceipt?: boolean;
  /**
   * The logbook type this row is ("fuel", "damage"). `null`/absent — and
   * `cost` from the logbook routes — is the ledger itself. A logbook entry with
   * no money has `amountCents: 0` and says what it is through this.
   */
  logType?: string | null;
}


/** One logbook entry, as the logbook routes return it. */
export interface AssetLogEntry extends AssetMoneyEntry {
  assetId: string;
  logType: string;
  /** Answers keyed by FIELD key. Money and photo live in amountCents / hasReceipt. */
  values: Record<string, string | number> | null;
  reviewedAt?: string | null;
  author?: CustodyHolderRef | null;
  createdAt: string;
}


export interface AssetLogPage {
  entries: AssetLogEntry[];
  nextCursor: string | null;
}


/** Where one type of work stands, as the server computed it NOW. */
export interface AssetLogDue {
  key: string;
  label: string;
  color: string;
  lastEntryId: string;
  lastDoneAt: string;
  lastReading: number | null;
  meterKey: string | null;
  dueAt: string | null;
  dueReading: number | null;
  remindAt: string | null;
  remindReading: number | null;
  unit: string | null;
  reading: number | null;
  stage: 'ok' | 'soon' | 'overdue';
  progress: number;
  daysLeft: number | null;
  unitsLeft: number | null;
}


export interface AssetLogCredit {
  inCents: number;
  outCents: number;
  netCents: number;
  entries: number;
}


export interface AssetLogSummary {
  period: { from: string; to: string };
  readings: Record<string, { value: number; at: string; entryId: string }>;
  due: AssetLogDue[];
  waitingCount: number;
  byAuthor: Array<AssetLogCredit & { authorId: string | null; author: CustodyHolderRef | null }>;
  byType: Array<AssetLogCredit & { logType: string; label: string; color: string }>;
}


export interface CreateAssetLogInput {
  /** Made here, so a double click files one entry. */
  entryId?: string;
  logType: string;
  values: Record<string, string | number>;
  note?: string;
  occurredAt?: string;
  receiptKey?: string;
  receiptName?: string;
  receiptMime?: string;
}


export interface AssetMoneySummary {
  entries: AssetMoneyEntry[];
  totals: {
    inCents: number;
    outCents: number;
    netCents: number;
    /** Sent from a phone, in no total until somebody accepts it. */
    waitingCount?: number;
    waitingCents?: number;
  };
}


/** One party of a custody period — a member, or a client. */
export interface CustodyHolderRef {
  id: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  email?: string | null;
  avatarUrl?: string | null;
}


/**
 * One stretch during which one party held one asset.
 *
 * `endedAt: null` means they hold it now. `totals` is what the asset cost
 * DURING this period — computed from the dates, never stored against a holder.
 */
export interface CustodyPeriodDto {
  id: string;
  assetId: string;
  userId: string | null;
  customerId: string | null;
  startedAt: string;
  endedAt: string | null;
  reason: string | null;
  user?: CustodyHolderRef | null;
  customer?: CustodyHolderRef | null;
  totals: { inCents: number; outCents: number; netCents: number; entries: number };
  asset?: {
    id: string;
    name: string;
    status: AssetStatus;
    serialNumber?: string | null;
    model?: string | null;
    manufacturer?: string | null;
    category?: AssetCategory | null;
  };
}


export interface CustodyTimeline {
  periods: CustodyPeriodDto[];
  /** Money that falls in no period — real, and deliberately not hidden. */
  unattributed: { inCents: number; outCents: number; netCents: number; entries: number };
}


/** What a reader made of a contract, before a person corrects it. */
export interface ContractReading {
  registration?: { value: string; confidence: 'certain' | 'likely'; raw: string };
  vin?: { value: string; confidence: 'certain' | 'likely'; raw: string };
  serial?: { value: string; confidence: 'certain' | 'likely'; raw: string };
  manufacturer?: { value: string; confidence: 'certain' | 'likely'; raw: string };
  model?: { value: string; confidence: 'certain' | 'likely'; raw: string };
  startsOn?: { value: string; confidence: 'certain' | 'likely'; raw: string };
  endsOn?: { value: string; confidence: 'certain' | 'likely'; raw: string };
  lines: string[];
}


/** The corrected reading — what the server is actually sent. */
export interface ContractFields {
  name?: string;
  registration?: string;
  vin?: string;
  serial?: string;
  manufacturer?: string;
  model?: string;
  startsOn?: string;
  endsOn?: string;
}


export type ContractStep =
  | { kind: 'create'; asset: { name: string; serialNumber?: string; model?: string; manufacturer?: string; details: Array<{ label: string; value: string }> } }
  | { kind: 'hand-over'; startsOn?: string }
  | { kind: 'close'; assetId: string; assetName: string }
  | { kind: 'retire'; assetId: string; assetName: string };


export interface ContractPreview {
  asset: { name: string; serialNumber?: string; model?: string; manufacturer?: string; details: Array<{ label: string; value: string }> };
  steps: ContractStep[];
  problems: Array<{ kind: 'no-name' | 'no-holder' }>;
  canApply: boolean;
  startsAt: string;
  /** The term begins later than today, so custody is recorded from today. */
  startClamped: boolean;
}


export interface ContractProposalInput {
  categoryId: string;
  typeId?: string;
  holderUserId: string;
  fields: ContractFields;
  retireReplaced?: boolean;
}


/** A page a member sent in, waiting on somebody responsible. */
export interface AssetProposal {
  id: string;
  fields: ContractFields;
  signals?: string[];
  documentKind: 'asset-contract' | 'unknown';
  categoryId: string | null;
  raisedById: string;
  holderUserId: string | null;
  raisedBy?: CustodyHolderRef | null;
  holder?: CustodyHolderRef | null;
  hasDocument: boolean;
  fileName?: string | null;
  createdAt: string;
}


/** One expense waiting on a decision, in the office's queue. */
export interface PendingExpense extends AssetMoneyEntry {
  assetId: string;
  asset?: { id: string; name: string } | null;
  author?: CustodyHolderRef | null;
  createdAt: string;
}


export interface AssetActivity {
  id: string;
  type: string;
  body: string | null;
  authorId: string | null;
  author?: { id: string; firstName: string; lastName: string } | null;
  metadata?: unknown;
  createdAt: string;
}


export interface CreateAssetCategoryInput {
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  /** The space this kind belongs to. */
  spaceId?: string;
  /** What this kind's records look like. */
  config?: unknown;
}


export interface UpdateAssetCategoryInput {
  name?: string;
  description?: string;
  icon?: string;
  color?: string;
}


export interface CreateAssetTypeInput {
  name: string;
  description?: string;
}


export interface UpdateAssetTypeInput {
  name?: string;
  description?: string;
}


export interface CreateAssetInput {
  name: string;
  serialNumber?: string;
  model?: string;
  manufacturer?: string;
  status?: AssetStatus;
  installDate?: string;
  warrantyExpiry?: string;
  locationAddress?: string;
  locationLat?: number;
  locationLng?: number;
  notes?: string;
  categoryId?: string;
  typeId?: string;
  /** Member who holds this (clears any client). */
  holderUserId?: string | null;
  /** Client who holds this (clears any member). */
  customerId?: string | null;
  /** Values for the fields this record's kind asks for. */
  details?: { label: string; value: string }[];
  /** Who holds it — one, or several when the type allows it. */
  holders?: AssetHolderInput[];
  /** The workspace, read by the module gate — an asset itself inherits its kind's. */
  spaceId?: string
}


/** One holder on an asset: a member OR a client, never both. */
export interface AssetHolderInput {
  userId?: string | null;
  customerId?: string | null;
}


export interface UpdateAssetInput {
  name?: string;
  /** null clears the fact — "" would be stored as a blank serial number. */
  serialNumber?: string | null;
  model?: string | null;
  manufacturer?: string | null;
  status?: AssetStatus;
  /** YYYY-MM-DD, or null to clear. */
  installDate?: string | null;
  warrantyExpiry?: string | null;
  locationAddress?: string;
  locationLat?: number;
  locationLng?: number;
  notes?: string | null;
  categoryId?: string | null;
  typeId?: string | null;
  /** Who holds it — one, or several when the type allows it. */
  holders?: AssetHolderInput[];
}


/** One counted module's numbers — the same shape for assets, clients and portals. */
export interface ModuleUsageCounts {
  total: number;
  /** Records in no space — billed by nobody. For assets, listed by `getOrphans`. */
  unassigned: number;
  /** spaceId → how many. */
  spaces: Record<string, number>;
}


/**
 * What each counted module has in it — see `assetsApi.getUsage`.
 *
 * The asset numbers are repeated at the top level because the orphan card and
 * the space header read them there; `modules` is the shape everything new
 * should use, keyed by the same module keys the pricing ladders are.
 */
export interface AssetUsage extends ModuleUsageCounts {
  modules?: Record<string, ModuleUsageCounts>;
}


/** An asset that belongs to no space — see `assetsApi.getOrphans`. */
export interface OrphanAsset {
  id: string;
  name: string;
  status: AssetStatus;
  serialNumber: string | null;
  createdAt: string;
  category: { id: string; name: string } | null;
  type: { id: string; name: string } | null;
  _count: { tasks: number };
}


export interface AssetsQueryParams {
  /** One workspace. The server intersects it with the caller's own. */
  spaceId?: string;
  categoryId?: string;
  typeId?: string;
  status?: AssetStatus;
  /** Leave RETIRED out. Text, as a query string carries it; ignored when `status` is set. */
  hideRetired?: 'true';
  search?: string;
  page?: number;
  limit?: number;
}
