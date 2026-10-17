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

// CompanyLocation, Break, TimeEntry, AttendanceStatus
// are defined in ./attendance.ts and re-exported below via `export * from './attendance'`

// Employee Assignment interface (many-to-many: User ↔ CompanyLocation)
export interface EmployeeAssignment extends BaseEntity {
  userId: string;
  locationId: string;
  isPrimary: boolean;
  schedule: string[];
  effectiveFrom: Date;
  effectiveTo?: Date;
  location?: {
    id: string;
    name: string;
    address?: string;
    lat: number;
    lng: number;
    geofenceRadius: number;
  };
  user?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
}

/** @deprecated Use EmployeeAssignment */
export type TechnicianAssignment = EmployeeAssignment;

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
