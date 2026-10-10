import type { DayEntry, HoursEntry, IssuerSnapshot } from '@hbcfield/shared/client';

/**
 * An invoice as the API returns it — mirrors the Prisma model.
 *
 * Written out rather than left as `any`: the invoice screens read a dozen
 * fields off these objects and every one of them was unchecked, so a renamed
 * column reached production as a blank cell instead of a build error.
 */
export interface InvoiceItem {
  id: string;
  invoiceId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  /** Set when the line came from a task or its service report. */
  taskId?: string | null;
  reportId?: string | null;
  /** HOURS / DAYS for labour, HEADING for a work-role heading (priced at zero). */
  lineKind?: 'HOURS' | 'DAYS' | 'HEADING' | null;
  billedDays?: number | null;
  /** DAYS lines: whose days, and the run — what stops them being billed twice. */
  workerId?: string | null;
  dayFrom?: string | null;
  dayTo?: string | null;
  taskIds?: string[];
  /** HOURS runs: which hours were billed (counted / clocked / shift). */
  hoursBasis?: 'COUNTED' | 'CLOCKED' | 'SHIFT' | null;
  createdAt: string;
}


/**
 * ⚠️ ISSUED sits between DRAFT and SENT: final and numbered, not yet delivered.
 * See `invoices/_lib/lifecycle.ts` for why the step exists and which way it
 * flows. REFUNDED exists in the database enum and has never been reachable.
 */
export type InvoiceStatus = 'DRAFT' | 'ISSUED' | 'SENT' | 'PAID' | 'OVERDUE' | 'CANCELED';


export interface Invoice {
  id: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  /** The customer space being billed; null for an ad-hoc invoice. */
  spaceId?: string | null;
  clientName: string;
  clientEmail?: string | null;
  clientAddress?: string | null;
  subtotal: number;
  taxRate?: number | null;
  taxAmount: number;
  discount: number;
  total: number;
  currency: string;
  /** 1 {currency} = exchangeRate {baseCurrency}, frozen with the invoice. Null = same currency or no rate known. */
  exchangeRate?: number | null;
  exchangeRateSource?: 'ECB' | 'MANUAL' | null;
  exchangeRateDate?: string | null;
  /** The organization's currency when this was issued. */
  baseCurrency?: string | null;
  /** The HOURS / DAYS tag before each labour line. */
  showLineTags?: boolean;
  issueDate: string;
  dueDate?: string | null;
  paidAt?: string | null;
  /**
   * The days this invoice covers — the SERVICE period, not the billing dates.
   * Null at either end is normal: an invoice can legitimately cover
   * "everything outstanding".
   */
  servicePeriodFrom?: string | null;
  servicePeriodTo?: string | null;
  notes?: string | null;
  /**
   * The language the client's copy is written in (en|de|es|fr|it), decided on
   * the server by the client-email rule. On the single-invoice read only.
   */
  documentLocale?: string | null;
  /** The company that issues it (Settings › Companies). */
  legalEntityId?: string | null;
  /** On the list: the issuing company's names. */
  legalEntity?: { id: string; legalName: string; label: string | null } | null;
  /**
   * The issuer as printed: FROZEN once issued, the live company for a draft.
   * On the single-invoice read only.
   */
  issuer?: IssuerSnapshot | null;
  organizationId: string;
  createdById: string;
  items: InvoiceItem[];
  createdAt: string;
  updatedAt: string;
}


/** What a new invoice needs; everything else is server-decided. */
export interface CreateInvoiceInput {
  spaceId?: string | null;
  /** The company that issues it; omitted = the workspace's → the client's → the main one. */
  legalEntityId?: string | null;
  /** The client billed outside a workspace — so the client's company can issue it. */
  customerId?: string | null;
  clientName: string;
  clientEmail?: string;
  clientAddress?: string;
  taxRate?: number;
  discount?: number;
  currency?: string;
  /** 1 {currency} = exchangeRate {the organization's}. Null clears; omitted lets the server ask the ECB. */
  exchangeRate?: number | null;
  exchangeRateSource?: 'ECB' | 'MANUAL' | null;
  exchangeRateDate?: string | null;
  /** The HOURS / DAYS tag before each labour line (default shown). */
  showLineTags?: boolean;
  /** Both accepted by the server; it defaults issueDate to now when omitted. */
  issueDate?: string;
  dueDate?: string;
  /** The days billed, `YYYY-MM-DD`. Omit both for "everything outstanding". */
  servicePeriodFrom?: string;
  servicePeriodTo?: string;
  notes?: string;
  items?: Array<Omit<InvoiceItem, 'id' | 'invoiceId' | 'amount' | 'createdAt'> & { amount?: number }>;
}


export type UpdateInvoiceInput = Partial<CreateInvoiceInput>;


export interface InvoiceItemInput {
  description: string;
  quantity: number;
  unitPrice: number;
  taskId?: string | null;
  reportId?: string | null;
  /**
   * The rates that applied when this line was drawn up, in integer cents.
   *
   * ⚠️ The record, not a cache. The ladder answers "what is this rate now"; an
   * issued invoice has to keep answering "what was it then", or a raise next
   * month moves an invoice already paid.
   */
  billRateCents?: number | null;
  costRateCents?: number | null;
  billedHours?: number | null;
  billedDays?: number | null;
  lineKind?: 'HOURS' | 'DAYS' | 'HEADING' | null;
  workerId?: string | null;
  dayFrom?: string | null;
  dayTo?: string | null;
  /** HOURS lines on a workspace invoice: the jobs those hours cover. */
  taskIds?: string[];
  /** HOURS runs: which hours were billed (counted / clocked / shift). */
  hoursBasis?: 'COUNTED' | 'CLOCKED' | 'SHIFT' | null;
}


/** A part fitted during a job, priced for the invoice. */
interface InvoiceGatherPart {
  name: string;
  partNumber?: string | null;
  quantity: number;
  unitCost: number;
  amount: number;
}


/** One completed job the gather endpoint offers as billable work. */
interface InvoiceGatherEntry {
  /** This member's own resolved rates, from the ladder. */
  billRateCents?: number | null;
  costRateCents?: number | null;
  taskId: string;
  taskTitle: string;
  reportId?: string | null;
  workerId?: string | null;
  workerName?: string | null;
  hours: number;
  laborAmount: number;
  completedAt?: string | null;
  notes?: string | null;
  parts: InvoiceGatherPart[];
  hasReport: boolean;
  /** The worker's trade here, when they have one. */
  workRoleId?: string | null;
  workRoleName?: string | null;
  /** False when billed by the DAY only: the job is listed, the days are charged. */
  hoursBillable?: boolean;
  /** How this person is billed here — decides where their cost is counted. */
  billBy?: 'HOUR' | 'DAY' | 'BOTH';
}


/**
 * Uninvoiced work for a space, with the client details pre-filled.
 *
 * Matches the gather handler field for field — it returns rather more than the
 * "list of lines" the screen's `as any` implied, including the hourly rate and
 * a per-worker hours summary.
 */
export interface InvoiceGatherResult {
  /** Null when the work was gathered by CLIENT rather than by workspace. */
  spaceId: string | null;
  /** Workspace → client → organization; where `currency` came from. */
  currencySource?: 'workspace' | 'client' | 'company' | 'organization';
  /** The company that would issue it — the create resolves it again, the same way. */
  legalEntityId?: string | null;
  /** The organization's currency — what costs and the margin are in. */
  baseCurrency?: string;
  /** The service period this covers, echoed back. Null ends mean "everything". */
  periodFrom?: string | null;
  periodTo?: string | null;
  customerId?: string | null;
  clientName?: string | null;
  clientEmail?: string | null;
  clientAddress?: string | null;
  currency: string;
  billableRateCents?: number | null;
  /** Currency units per hour, already divided out of the cents. */
  rate?: number | null;
  taskCount: number;
  totalHours: number;
  workerSummary: Array<{ name: string; hours: number }>;
  /**
   * Does this organisation work with two rates?
   *
   * ⚠️ Read off the DATA by the server, never a setting — and stripped to false
   * for anyone without `canViewLabourCost`, because "there is a margin here" is
   * itself an answer to the question they were not allowed to ask.
   */
  twoRates?: boolean;
  workEntries: InvoiceGatherEntry[];
  /** The workspace's zone — day keys below are calendar days there. */
  timezone?: string;
  /** Days worked by people billed by the day, split wherever the day rate changed. */
  dayEntries?: DayEntry[];
  /** Hours ON SITE by people billed by the hour, split wherever their rate changed (workspace invoices). */
  hourEntries?: HoursEntry[];
  /** Every day with something still to bill (`YYYY-MM-DD`, sorted). */
  outstandingDays?: string[];
}
