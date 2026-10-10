/** What the console reads from the platform API — one place, so a renamed field is one edit. */

export type Cap =
  | 'view' | 'extendTrial' | 'manageOrgs' | 'editPricing' | 'billingOps' | 'manageSupport'
  | 'manageSupportTeams' | 'manageLibrary' | 'managePlatformUsers' | 'viewPlatformAudit';

export const ROLES = ['OWNER', 'CONTROLLER', 'SUPPORT', 'BILLING'] as const;

export interface MeUser {
  id: string; email: string; firstName: string; lastName: string; role: string;
  twoFactorEnabled?: boolean;
  /** Server-authoritative: this session may only enrol a second factor. */
  enrolmentRequired?: boolean;
  isSupportSupervisor?: boolean; supportTeamIds?: string[];
}
export interface Me { user: MeUser; permissions: Cap[] }

/** What sign-in and every 2FA change return: a fresh token and who you are now. */
export interface SessionResponse extends Me { token: string; expiresIn?: number }
export type LoginResponse = SessionResponse | { needs2fa: true };

export interface Overview {
  totalOrgs: number; trialing: number; suspended: number; newLast30: number; byStatus: Record<string, number>;
  seats: number; mrrCents: number; arrCents: number; agreedCount: number; agreedAwayCents: number; listMrrCents: number;
}
export type BillingMode = 'AUTOMATIC' | 'INVOICE' | 'EXTERNAL';

export interface BillingAlertRow {
  id: string; kind: 'DROP' | 'SYNC_FAILED' | 'CONTRACT_DRIFT' | 'CONTRACT_EXPIRING';
  organizationId: string; organizationName: string; billingMode: BillingMode;
  fromCents: number | null; toCents: number | null; dropCents: number | null;
  detail: string | null; occurrences: number; lastSeenAt: string; createdAt: string; acknowledgedAt: string | null;
}

export interface OrgRow {
  id: string; name: string; planTier: string | null; subStatus: string; trialEndsAt: string | null; suspendedAt: string | null;
  createdAt: string; memberCount: number; seats: number; addOns: string[]; mrrCents: number; billingMode: BillingMode;
  invoiceDueDays: number; agreedMonthlyCents: number | null; agreedListCents: number | null; agreedUntil: string | null;
  agreedNote: string | null; agreedSetAt: string | null;
}
export interface OrgMember { id: string; firstName: string; lastName: string; email: string | null; role: string; isActive: boolean }
export interface OrgDetail extends Omit<OrgRow, 'memberCount'> {
  listMonthlyCents: number | null; enabledModules: string[]; hasBillingEmail: boolean; currentPeriodEnd: string | null;
  members: OrgMember[]; memberTotal: number;
}

export interface MailRouteStatus { label: string; host: string; port: number; ok: boolean; error: string | null }
export interface MailStatus { configured: boolean; ok: boolean; routes?: MailRouteStatus[]; host: string | null; port: number | null; error: string | null }

export interface StaffUser { id: string; email: string; firstName: string; lastName: string; role: string; isActive: boolean; twoFactorEnabled?: boolean; lastLoginAt: string | null }

export interface PriceModule { key: string; label: string; description: string; group: string; monthlyCents: number; counted: boolean }
export interface PriceAddOn { key: string; label: string; description: string; group: string; monthlyCents: number }
export interface Band { upTo: number | null; unitCents: number }
export interface Ladder { moduleKey: string; label: string; unit: string; included: number; bands: Band[] }
export interface PriceList { seatMonthlyCents: number; modules: PriceModule[]; addOns: PriceAddOn[]; ladders: Ladder[]; catalogueSize: number }
export interface StripeStatus {
  configured: boolean; expected: number; matched: number;
  missing: { lookupKey: string; cents: number; productName: string }[];
  mismatched: { lookupKey: string; codeCents: number; stripeCents: number; priceId: string }[];
  orphaned: { lookupKey: string; cents: number; interval: string; priceId: string }[];
}

export interface Ticket {
  id: string; subject: string; status: string; priority?: string;
  createdBy?: { firstName?: string; lastName?: string; email?: string } | null;
  lastCustomerMessageAt?: string | null; organizationId?: string;
  assignedTeamId?: string | null; assignedAgentId?: string | null; assignedAgentName?: string | null;
}
export interface Msg { id: string; authorType: string; authorId?: string; authorName?: string; body: string; isInternalNote?: boolean; createdAt: string }
export type InboxView = 'all' | 'mine' | 'unassigned' | 'team';

export interface TMember { id: string; platformUserId: string; teamRole: 'MANAGER' | 'AGENT'; user?: { firstName?: string; lastName?: string; email?: string; role?: string } | null }
export interface TRule { id: string; name: string; isActive: boolean; order: number; conditions: { planTier?: string[]; country?: string[]; state?: string[]; industry?: string[] } }
export interface Team { id: string; name: string; color?: string | null; description?: string | null; isActive: boolean; members: TMember[]; routingRules: TRule[]; _count?: { members: number; routingRules: number; pinnedOrgs: number } }
export interface TStaff { id: string; firstName: string; lastName: string; email: string; role: string }
export interface PinnedOrg { id: string; name: string; planTier?: string | null; country?: string | null; industry?: string | null }

export interface TplStatus { name: string; key: string; color: string; icon?: string; position: number; isFinal: boolean; isCanceled: boolean; transitions: string[]; capabilities: string[] }
export interface TplProblem { code: string; statusKey?: string; message: string }
export interface Tpl {
  id: string; slug: string; name: string; description: string | null; industry: string | null; icon: string | null; position: number;
  isPublished: boolean; isBuiltIn: boolean; submittedByOrgId: string | null; submittedByOrgName: string | null; submittedAt: string | null;
  statuses: TplStatus[]; problems: TplProblem[]; advice: TplProblem[];
}

export interface AuditRow {
  id: string; actorType: 'STAFF' | 'STATIC_KEY' | 'ANONYMOUS'; actorId: string | null; actorLabel: string | null; actorRole: string | null;
  ipAddress: string | null; userAgent: string | null; method: string; route: string; action: string;
  targetOrganizationId: string | null; targetOrganizationName: string | null; summary: unknown;
  ok: boolean; statusCode: number | null; error: string | null; createdAt: string;
}
