/** The organization, a member's workspace assignment, cross-organization access. */
import { AccessLevel } from '../enums';
import type { BaseEntity } from './api-user';
import type { ModuleKey } from './org-modules';

// Organization interface
export interface Organization extends BaseEntity {
  name: string;
  isActive: boolean;
  enabledModules?: ModuleKey[] | null;
}

// Organization Access (delegation between orgs)
export interface OrganizationAccess extends BaseEntity {
  grantorOrgId: string;    // The org granting access
  granteeOrgId: string;    // The org receiving access
  accessLevel: AccessLevel;
  canViewTasks: boolean;
  canAssignWorkers: boolean;
  canViewWorkers: boolean;
  canViewTracking: boolean;
}
