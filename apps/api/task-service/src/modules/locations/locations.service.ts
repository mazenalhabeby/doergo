import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { success, paginated, WorkMode } from '@doergo/shared';

// Valid schedule days
const VALID_DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

@Injectable()
export class LocationsService {
  private readonly logger = new Logger(LocationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new company location
   */
  async create(data: {
    name: string;
    address?: string;
    lat: number;
    lng: number;
    geofenceRadius?: number;
    organizationId: string;
    userId: string;
  }) {
    this.logger.log(`Creating company location: ${data.name}`);

    const location = await this.prisma.companyLocation.create({
      data: {
        name: data.name,
        address: data.address,
        lat: data.lat,
        lng: data.lng,
        geofenceRadius: data.geofenceRadius ?? 15,
        organizationId: data.organizationId,
      },
    });

    this.logger.log(`Company location created: ${location.id}`);
    return success(location, 'Company location created successfully');
  }

  /**
   * Get all company locations for an organization
   */
  async findAll(data: {
    organizationId: string;
    page?: number;
    limit?: number;
    includeInactive?: boolean;
  }) {
    const page = data.page ?? 1;
    const limit = data.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = {
      organizationId: data.organizationId,
    };

    // By default, only show active locations
    if (!data.includeInactive) {
      where.isActive = true;
    }

    const [locations, total] = await Promise.all([
      this.prisma.companyLocation.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
      }),
      this.prisma.companyLocation.count({ where }),
    ]);

    return paginated(locations, { page, limit, total });
  }

  /**
   * Get a single company location by ID
   */
  async findOne(data: { id: string; organizationId: string }) {
    const location = await this.prisma.companyLocation.findFirst({
      where: {
        id: data.id,
        organizationId: data.organizationId,
      },
    });

    if (!location) {
      throw new NotFoundException('Company location not found');
    }

    return success(location);
  }

  /**
   * Update a company location
   */
  async update(data: {
    id: string;
    organizationId: string;
    userId: string;
    name?: string;
    address?: string;
    lat?: number;
    lng?: number;
    geofenceRadius?: number;
    isActive?: boolean;
  }) {
    // Verify location exists and belongs to organization
    const existing = await this.prisma.companyLocation.findFirst({
      where: {
        id: data.id,
        organizationId: data.organizationId,
      },
    });

    if (!existing) {
      throw new NotFoundException('Company location not found');
    }

    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.address !== undefined) updateData.address = data.address;
    if (data.lat !== undefined) updateData.lat = data.lat;
    if (data.lng !== undefined) updateData.lng = data.lng;
    if (data.geofenceRadius !== undefined) updateData.geofenceRadius = data.geofenceRadius;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    const location = await this.prisma.companyLocation.update({
      where: { id: data.id },
      data: updateData,
    });

    this.logger.log(`Company location updated: ${location.id}`);
    return success(location, 'Company location updated successfully');
  }

  /**
   * Soft delete a company location (set isActive to false)
   */
  async remove(data: { id: string; organizationId: string; userId: string }) {
    // Verify location exists and belongs to organization
    const existing = await this.prisma.companyLocation.findFirst({
      where: {
        id: data.id,
        organizationId: data.organizationId,
      },
    });

    if (!existing) {
      throw new NotFoundException('Company location not found');
    }

    const location = await this.prisma.companyLocation.update({
      where: { id: data.id },
      data: { isActive: false },
    });

    this.logger.log(`Company location deactivated: ${location.id}`);
    return success(location, 'Company location deactivated successfully');
  }

  // ==================== TECHNICIAN ASSIGNMENT METHODS ====================

  /**
   * Assign a technician to a company location
   */
  async assignTechnician(data: {
    userId: string;
    locationId: string;
    isPrimary?: boolean;
    schedule?: string[];
    effectiveFrom?: Date | string;
    effectiveTo?: Date | string;
    requestingUserId: string;
    organizationId: string;
  }) {
    this.logger.log(`Assigning technician ${data.userId} to location ${data.locationId}`);

    // Verify technician exists and has on-site work mode
    const technician = await this.prisma.user.findFirst({
      where: {
        id: data.userId,
        organizationId: data.organizationId,
        role: 'TECHNICIAN',
      },
      select: {
        id: true,
        workMode: true,
        organizationId: true,
      },
    });

    if (!technician) {
      throw new NotFoundException('Technician not found in organization');
    }

    if (technician.workMode === WorkMode.ON_ROAD) {
      throw new BadRequestException(
        'ON_ROAD technicians cannot be assigned to company locations. Change work mode to ON_SITE or HYBRID.',
      );
    }

    // Verify location exists and belongs to organization
    const location = await this.prisma.companyLocation.findFirst({
      where: {
        id: data.locationId,
        organizationId: data.organizationId,
        isActive: true,
      },
    });

    if (!location) {
      throw new NotFoundException('Company location not found');
    }

    // Validate schedule days if provided
    if (data.schedule && data.schedule.length > 0) {
      const invalidDays = data.schedule.filter((day) => !VALID_DAYS.includes(day));
      if (invalidDays.length > 0) {
        throw new BadRequestException(
          `Invalid schedule days: ${invalidDays.join(', ')}. Valid days: ${VALID_DAYS.join(', ')}`,
        );
      }
    }

    // If setting as primary, unset other primary assignments for this user
    if (data.isPrimary) {
      await this.prisma.technicianAssignment.updateMany({
        where: {
          userId: data.userId,
          isPrimary: true,
        },
        data: { isPrimary: false },
      });
    }

    // Create the assignment (upsert to handle existing assignment)
    const assignment = await this.prisma.technicianAssignment.upsert({
      where: {
        userId_locationId: {
          userId: data.userId,
          locationId: data.locationId,
        },
      },
      update: {
        isPrimary: data.isPrimary ?? false,
        schedule: data.schedule ?? [],
        effectiveFrom: data.effectiveFrom ? new Date(data.effectiveFrom) : new Date(),
        effectiveTo: data.effectiveTo ? new Date(data.effectiveTo) : null,
      },
      create: {
        userId: data.userId,
        locationId: data.locationId,
        isPrimary: data.isPrimary ?? false,
        schedule: data.schedule ?? [],
        effectiveFrom: data.effectiveFrom ? new Date(data.effectiveFrom) : new Date(),
        effectiveTo: data.effectiveTo ? new Date(data.effectiveTo) : null,
      },
      include: {
        location: true,
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            technicianType: true,
          },
        },
      },
    });

    this.logger.log(`Technician assignment created/updated: ${assignment.id}`);
    return success(assignment, 'Technician assigned to location successfully');
  }

  /**
   * Get all technicians assigned to a location
   */
  async getLocationAssignments(data: {
    locationId: string;
    organizationId: string;
  }) {
    // Verify location exists and belongs to organization
    const location = await this.prisma.companyLocation.findFirst({
      where: {
        id: data.locationId,
        organizationId: data.organizationId,
      },
    });

    if (!location) {
      throw new NotFoundException('Company location not found');
    }

    const assignments = await this.prisma.technicianAssignment.findMany({
      where: {
        locationId: data.locationId,
        // Only show active assignments (not expired)
        OR: [
          { effectiveTo: null },
          { effectiveTo: { gte: new Date() } },
        ],
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            technicianType: true,
          },
        },
      },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });

    return success(assignments);
  }

  /**
   * Get all location assignments for a technician
   */
  async getTechnicianAssignments(data: {
    userId: string;
    organizationId: string;
  }) {
    // Verify user exists and belongs to organization
    const user = await this.prisma.user.findFirst({
      where: {
        id: data.userId,
        organizationId: data.organizationId,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found in organization');
    }

    const assignments = await this.prisma.technicianAssignment.findMany({
      where: {
        userId: data.userId,
        // Only show active assignments (not expired)
        OR: [
          { effectiveTo: null },
          { effectiveTo: { gte: new Date() } },
        ],
      },
      include: {
        location: true,
      },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });

    return success(assignments);
  }

  /**
   * Update an existing assignment
   */
  async updateAssignment(data: {
    assignmentId: string;
    organizationId: string;
    isPrimary?: boolean;
    schedule?: string[];
    effectiveFrom?: Date | string;
    effectiveTo?: Date | string;
  }) {
    // Find the assignment and verify organization ownership
    const assignment = await this.prisma.technicianAssignment.findFirst({
      where: { id: data.assignmentId },
      include: {
        location: true,
      },
    });

    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    if (assignment.location.organizationId !== data.organizationId) {
      throw new NotFoundException('Assignment not found');
    }

    // Validate schedule days if provided
    if (data.schedule && data.schedule.length > 0) {
      const invalidDays = data.schedule.filter((day) => !VALID_DAYS.includes(day));
      if (invalidDays.length > 0) {
        throw new BadRequestException(
          `Invalid schedule days: ${invalidDays.join(', ')}. Valid days: ${VALID_DAYS.join(', ')}`,
        );
      }
    }

    // If setting as primary, unset other primary assignments for this user
    if (data.isPrimary) {
      await this.prisma.technicianAssignment.updateMany({
        where: {
          userId: assignment.userId,
          isPrimary: true,
          id: { not: data.assignmentId },
        },
        data: { isPrimary: false },
      });
    }

    const updateData: any = {};
    if (data.isPrimary !== undefined) updateData.isPrimary = data.isPrimary;
    if (data.schedule !== undefined) updateData.schedule = data.schedule;
    if (data.effectiveFrom !== undefined)
      updateData.effectiveFrom = new Date(data.effectiveFrom);
    if (data.effectiveTo !== undefined)
      updateData.effectiveTo = data.effectiveTo ? new Date(data.effectiveTo) : null;

    const updated = await this.prisma.technicianAssignment.update({
      where: { id: data.assignmentId },
      data: updateData,
      include: {
        location: true,
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            technicianType: true,
          },
        },
      },
    });

    this.logger.log(`Assignment updated: ${updated.id}`);
    return success(updated, 'Assignment updated successfully');
  }

  /**
   * Remove a technician assignment
   */
  async removeAssignment(data: { assignmentId: string; organizationId: string }) {
    // Find the assignment and verify organization ownership
    const assignment = await this.prisma.technicianAssignment.findFirst({
      where: { id: data.assignmentId },
      include: {
        location: true,
      },
    });

    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    if (assignment.location.organizationId !== data.organizationId) {
      throw new NotFoundException('Assignment not found');
    }

    await this.prisma.technicianAssignment.delete({
      where: { id: data.assignmentId },
    });

    this.logger.log(`Assignment removed: ${data.assignmentId}`);
    return success(null, 'Assignment removed successfully');
  }
}
