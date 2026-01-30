/**
 * User/Technician DTOs for Auth Service
 */

import { TechnicianType } from '@doergo/shared';

/**
 * DTO for creating a new technician
 */
export interface CreateTechnicianDto {
  email: string;
  firstName: string;
  lastName: string;
  password?: string;
  technicianType?: TechnicianType;
  specialty?: string;
  maxDailyJobs?: number;
  organizationId: string;
}

/**
 * DTO for updating a technician
 */
export interface UpdateTechnicianDto {
  firstName?: string;
  lastName?: string;
  technicianType?: TechnicianType;
  specialty?: string;
  maxDailyJobs?: number;
  isActive?: boolean;
  rating?: number;
  ratingCount?: number;
}

/**
 * DTO for listing technicians
 */
export interface ListTechniciansDto {
  organizationId: string;
  status?: 'active' | 'inactive' | 'all';
  type?: TechnicianType | 'all';
  specialty?: string;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: 'name' | 'email' | 'rating' | 'taskCount' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

/**
 * DTO for getting technician detail
 */
export interface GetTechnicianDetailDto {
  id: string;
  organizationId: string;
}

/**
 * DTO for getting technician performance
 */
export interface GetTechnicianPerformanceDto {
  id: string;
  organizationId: string;
  startDate?: string;
  endDate?: string;
}
