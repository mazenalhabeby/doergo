/** Message contracts for auth-service `platform-admin` handlers (types only — the wire is the cmd string). */
import { rpc } from '../contract';
import type { PlatformCapability } from '../../platform/permissions';

/** What PlatformAuthGuard reads of a validated console session. */
export type PlatformValidateTokenReply =
  | { valid: false }
  | {
      valid: true;
      user: { role: string; enrolmentRequired?: boolean } & Record<string, unknown>;
      permissions: PlatformCapability[];
      /** About THIS token (not the account) — what logout and refresh need. */
      session: { iat: number; authTime: number };
    };
import type { RoutingConditions } from '../../support/routing';

export interface PlatformAuditInput {
  actorType?: string;
  actorId?: string | null;
  actorLabel?: string | null;
  actorRole?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  method?: string;
  route?: string;
  action?: string;
  targetOrganizationId?: string | null;
  summary?: unknown;
  ok?: boolean;
  statusCode?: number | null;
  error?: string | null;
}

export const platformSupportStaffList = rpc<Record<string, never>>('platform_support_staff_list');
export const platformSupportTeamsList = rpc<Record<string, never>>('platform_support_teams_list');
export const platformSupportTeamCreate = rpc<{ name: string; color?: string; description?: string }>(
  'platform_support_team_create',
);
export const platformSupportTeamUpdate = rpc<{
  teamId: string;
  name?: string;
  color?: string | null;
  description?: string | null;
  isActive?: boolean;
}>('platform_support_team_update');
export const platformSupportTeamDelete = rpc<{ teamId: string }>('platform_support_team_delete');
export const platformSupportTeamAddMember = rpc<{
  teamId: string;
  platformUserId: string;
  teamRole?: 'MANAGER' | 'AGENT';
}>('platform_support_team_add_member');
export const platformSupportTeamRemoveMember = rpc<{ teamId: string; platformUserId: string }>(
  'platform_support_team_remove_member',
);
export const platformSupportRuleUpsert = rpc<{
  id?: string;
  teamId: string;
  name: string;
  conditions: RoutingConditions;
  order?: number;
  isActive?: boolean;
}>('platform_support_rule_upsert');
export const platformSupportRuleDelete = rpc<{ ruleId: string }>('platform_support_rule_delete');
export const platformSupportPinOrg = rpc<{ organizationId: string; teamId: string | null }>('platform_support_pin_org');
export const platformSupportTeamPinnedOrgs = rpc<{ teamId: string }>('platform_support_team_pinned_orgs');
export const platformPricingList = rpc<Record<string, never>>('platform_pricing_list');
export const platformLogin = rpc<{ email?: string; password?: string; code?: string }>('platform_login');
export const platformValidateToken = rpc<{ token: string }, PlatformValidateTokenReply>('platform_validate_token');
export const platformMe = rpc<{ userId: string }>('platform_me');
export const platformUsersList = rpc<Record<string, never>>('platform_users_list');
export const platformUsersCreate = rpc<{
  email?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  byUserId?: string;
}>('platform_users_create');
export const platformUsersUpdate = rpc<{ id: string; role?: string; isActive?: boolean; byUserId?: string }>(
  'platform_users_update',
);
export const platformUsersResetPassword = rpc<{ id: string; password?: string; byUserId?: string }>(
  'platform_users_reset_password',
);
export const platformBootstrapOwner = rpc<{ email?: string; password?: string; firstName?: string; lastName?: string }>(
  'platform_bootstrap_owner',
);
export const platformChangePassword = rpc<{
  userId: string;
  currentPassword?: string;
  newPassword?: string;
  authTime?: number;
}>('platform_change_password');
export const platform2faSetup = rpc<{ userId: string; code?: string; authTime?: number }>('platform_2fa_setup');
export const platform2faEnable = rpc<{ userId: string; code?: string; authTime?: number }>('platform_2fa_enable');
export const platform2faDisable = rpc<{ userId: string; code?: string; authTime?: number }>('platform_2fa_disable');
export const platformUsersReset2fa = rpc<{ id: string; byUserId?: string }>('platform_users_reset_2fa');
export const platformLogout = rpc<{ userId: string; iat?: number }>('platform_logout');
export const platformRefresh = rpc<{ userId: string; authTime?: number }>('platform_refresh');
export const platformAuditWrite = rpc<PlatformAuditInput>('platform_audit_write');
export const platformAuditList = rpc<{ cursor?: string; limit?: number; actorId?: string; organizationId?: string }>(
  'platform_audit_list',
);
export const platformOverview = rpc<Record<string, never>>('platform_overview');
export const platformListOrgs = rpc<{ search?: string; status?: string; cursor?: string; limit?: number }>(
  'platform_list_orgs',
);
export const platformOrgDetail = rpc<{ organizationId: string; viewerRole?: string; memberLimit?: number }>(
  'platform_org_detail',
);
export const platformEndTrial = rpc<{ organizationId: string; byUserId?: string }>('platform_end_trial');
export const platformBillingAlerts = rpc<{ includeAcknowledged?: boolean }>('platform_billing_alerts');
export const platformAckBillingAlert = rpc<{ id: string; byUserId?: string }>('platform_ack_billing_alert');
export const platformSetBillingMode = rpc<{
  organizationId: string;
  mode: 'AUTOMATIC' | 'INVOICE' | 'EXTERNAL';
  invoiceDueDays?: number;
  byUserId?: string;
}>('platform_set_billing_mode');
export const platformSetAgreedPrice = rpc<{
  organizationId: string;
  monthlyCents: number;
  until?: string | null;
  note?: string | null;
  byUserId?: string;
}>('platform_set_agreed_price');
export const platformClearAgreedPrice = rpc<{ organizationId: string; byUserId?: string }>(
  'platform_clear_agreed_price',
);
export const platformSuspend = rpc<{ organizationId: string; byUserId?: string }>('platform_suspend');
export const platformSetOfflineMode = rpc<{ organizationId: string; enabled: boolean; byUserId?: string }>(
  'platform_set_offline_mode',
);
export const platformReactivate = rpc<{ organizationId: string; byUserId?: string }>('platform_reactivate');
export const platformExtendTrial = rpc<{ organizationId: string; days: number; byUserId?: string }>(
  'platform_extend_trial',
);
