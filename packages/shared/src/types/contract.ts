/**
 * Work Contract Types
 *
 * Defines contract models, interfaces, and helpers for the work contract system.
 */

import { ContractType, OvertimePolicy, OvertimeDetectionSource } from './enums';

// ============================================================================
// INTERFACES
// ============================================================================

/** Work contract defining schedule type, hour budget, and overtime policy */
export interface WorkContract {
  id: string;
  userId: string;
  contractType: ContractType;
  monthlyHours?: number | null;
  overtimePolicy: OvertimePolicy;
  overtimeBudget?: number | null;
  effectiveFrom: string;
  effectiveTo?: string | null;
  isActive: boolean;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Position template for quick worker setup */
export interface PositionTemplate {
  id: string;
  name: string;
  description?: string | null;
  defaultModules: string[];
  defaultContractType?: ContractType | null;
  defaultOvertimePolicy?: OvertimePolicy | null;
  organizationId?: string | null;
  isSystem: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Monthly hours summary for budget tracking */
export interface MonthlyHoursSummary {
  id: string;
  userId: string;
  contractId: string;
  year: number;
  month: number;
  budgetHours: number;
  workedHours: number;
  overtimeHours: number;
  lastCalculatedAt: string;
}

/** Input for creating a work contract */
export interface CreateContractInput {
  contractType: ContractType;
  monthlyHours?: number;
  overtimePolicy?: OvertimePolicy;
  overtimeBudget?: number;
  effectiveFrom?: string;
  notes?: string;
}

/** Input for creating a position template */
export interface CreatePositionTemplateInput {
  name: string;
  description?: string;
  defaultModules: string[];
  defaultContractType?: ContractType;
  defaultOvertimePolicy?: OvertimePolicy;
}

/** Compliance summary for a single worker */
export interface WorkerComplianceSummary {
  userId: string;
  firstName: string;
  lastName: string;
  position?: string | null;
  contractType: ContractType;
  // For FIXED_SCHEDULE
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  actualClockIn?: string | null;
  lateMinutes?: number;
  isMissing?: boolean;
  // For HOUR_BUDGET
  budgetHours?: number;
  workedHours?: number;
  burnRate?: number; // percentage
  projectedEndOfMonth?: number;
}

/** Organization-wide compliance summary */
export interface ComplianceDashboard {
  date: string;
  fixedScheduleWorkers: WorkerComplianceSummary[];
  hourBudgetWorkers: WorkerComplianceSummary[];
  summary: {
    totalWorkers: number;
    lateArrivals: number;
    missingWorkers: number;
    onTrackBudget: number;
    overBudget: number;
  };
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get display label for contract type
 */
export function getContractTypeLabel(type: ContractType): string {
  switch (type) {
    case ContractType.FIXED_SCHEDULE:
      return 'Fixed Schedule';
    case ContractType.HOUR_BUDGET:
      return 'Hour Budget';
    default:
      return type;
  }
}

/**
 * Get color class for contract type badge
 */
export function getContractTypeColor(type: ContractType): string {
  switch (type) {
    case ContractType.FIXED_SCHEDULE:
      return 'bg-blue-100 text-blue-700';
    case ContractType.HOUR_BUDGET:
      return 'bg-purple-100 text-purple-700';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

/**
 * Get display label for overtime policy
 */
export function getOvertimePolicyLabel(policy: OvertimePolicy): string {
  switch (policy) {
    case OvertimePolicy.PRE_APPROVED:
      return 'Pre-Approved';
    case OvertimePolicy.REAL_TIME:
      return 'Real-Time Approval';
    case OvertimePolicy.POST_APPROVAL:
      return 'Post-Approval';
    default:
      return policy;
  }
}

/**
 * Get display label for overtime detection source
 */
export function getDetectionSourceLabel(source: OvertimeDetectionSource): string {
  switch (source) {
    case OvertimeDetectionSource.MANUAL:
      return 'Manual';
    case OvertimeDetectionSource.AUTO_BUDGET:
      return 'Auto (Budget)';
    case OvertimeDetectionSource.AUTO_SCHEDULE:
      return 'Auto (Schedule)';
    default:
      return source;
  }
}

/**
 * Get color class for detection source badge
 */
export function getDetectionSourceColor(source: OvertimeDetectionSource): string {
  switch (source) {
    case OvertimeDetectionSource.MANUAL:
      return 'bg-gray-100 text-gray-700';
    case OvertimeDetectionSource.AUTO_BUDGET:
      return 'bg-amber-100 text-amber-700';
    case OvertimeDetectionSource.AUTO_SCHEDULE:
      return 'bg-orange-100 text-orange-700';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

/**
 * Get the active contract from a list of contracts
 */
export function getActiveContract(contracts: WorkContract[]): WorkContract | undefined {
  return contracts.find(c => c.isActive && !c.effectiveTo);
}

/**
 * Calculate budget burn percentage
 */
export function getBudgetBurnRate(workedHours: number, budgetHours: number): number {
  if (budgetHours <= 0) return 0;
  return Math.round((workedHours / budgetHours) * 100);
}
