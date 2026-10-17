/** What the console reads about support: tickets, teams, routing, workflow templates, the audit log. */

export interface PlatformTicket {
  id: string;
  subject: string;
  status: string;
  priority?: string;
  createdBy?: { firstName?: string; lastName?: string; email?: string } | null;
  lastCustomerMessageAt?: string | null;
  organizationId?: string;
  assignedTeamId?: string | null;
  assignedAgentId?: string | null;
  assignedAgentName?: string | null;
  /** The first-response promise was missed — the inbox marks the row. */
  slaBreached?: boolean;
  /** When the first response is due (null once answered / no promise). */
  slaFirstResponseDueAt?: string | null;
}

export interface PlatformTicketMessage {
  id: string;
  authorType: string;
  authorId?: string;
  authorName?: string;
  body: string;
  isInternalNote?: boolean;
  createdAt: string;
}

export type PlatformInboxView = 'all' | 'mine' | 'unassigned' | 'team';

export interface PlatformTeamMember {
  id: string;
  platformUserId: string;
  teamRole: 'MANAGER' | 'AGENT';
  user?: { firstName?: string; lastName?: string; email?: string; role?: string } | null;
}

export interface PlatformRoutingRule {
  id: string;
  name: string;
  isActive: boolean;
  order: number;
  conditions: { planTier?: string[]; country?: string[]; state?: string[]; industry?: string[] };
}

export interface PlatformTeam {
  id: string;
  name: string;
  color?: string | null;
  description?: string | null;
  isActive: boolean;
  members: PlatformTeamMember[];
  routingRules: PlatformRoutingRule[];
  _count?: { members: number; routingRules: number; pinnedOrgs: number };
}

export interface PlatformTeamStaff {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
}

export interface PlatformPinnedOrg {
  id: string;
  name: string;
  planTier?: string | null;
  country?: string | null;
  industry?: string | null;
}

export interface PlatformTemplateStatus {
  name: string;
  key: string;
  color: string;
  icon?: string;
  position: number;
  isFinal: boolean;
  isCanceled: boolean;
  transitions: string[];
  capabilities: string[];
}

export interface PlatformTemplateProblem {
  code: string;
  statusKey?: string;
  message: string;
}

export interface PlatformTemplate {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  industry: string | null;
  icon: string | null;
  position: number;
  isPublished: boolean;
  isBuiltIn: boolean;
  submittedByOrgId: string | null;
  submittedByOrgName: string | null;
  submittedAt: string | null;
  statuses: PlatformTemplateStatus[];
  problems: PlatformTemplateProblem[];
  advice: PlatformTemplateProblem[];
}

export interface PlatformAuditRow {
  id: string;
  actorType: 'STAFF' | 'STATIC_KEY' | 'ANONYMOUS';
  actorId: string | null;
  actorLabel: string | null;
  actorRole: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  method: string;
  route: string;
  action: string;
  targetOrganizationId: string | null;
  targetOrganizationName: string | null;
  summary: unknown;
  ok: boolean;
  statusCode: number | null;
  error: string | null;
  createdAt: string;
}
