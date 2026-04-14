import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { success, paginated, ApprovalStatus } from '@hbcfield/shared';

@Injectable()
export class ApprovalService {
  private readonly logger = new Logger(ApprovalService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get entries pending approval
   */
  async getPendingApprovals(data: {
    organizationId: string;
    page?: number;
    limit?: number;
  }) {
    const page = data.page ?? 1;
    const limit = data.limit ?? 20;
    const skip = (page - 1) * limit;

    const where = {
      organizationId: data.organizationId,
      approvalStatus: ApprovalStatus.PENDING,
      status: { not: 'CLOCKED_IN' as any }, // Only completed entries
    };

    const [entries, total] = await Promise.all([
      this.prisma.timeEntry.findMany({
        where,
        skip,
        take: limit,
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          location: {
            select: { id: true, name: true },
          },
          breaks: true,
        },
        orderBy: { clockInAt: 'desc' },
      }),
      this.prisma.timeEntry.count({ where }),
    ]);

    return paginated(entries, { page, limit, total });
  }

  /**
   * Approve a time entry
   */
  async approveEntry(data: {
    entryId: string;
    approverId: string;
    organizationId: string;
    notes?: string;
  }) {
    const entry = await this.prisma.timeEntry.findFirst({
      where: {
        id: data.entryId,
        organizationId: data.organizationId,
      },
    });

    if (!entry) {
      throw new NotFoundException('Time entry not found');
    }

    if (entry.approvalStatus !== 'PENDING') {
      throw new BadRequestException(
        `Entry is already ${entry.approvalStatus.toLowerCase()}`,
      );
    }

    const updated = await this.prisma.timeEntry.update({
      where: { id: data.entryId },
      data: {
        approvalStatus: ApprovalStatus.APPROVED,
        approvedById: data.approverId,
        approvedAt: new Date(),
        approvalNotes: data.notes,
      },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true },
        },
        location: {
          select: { name: true },
        },
      },
    });

    this.logger.log(
      `Entry approved: entry=${data.entryId}, approver=${data.approverId}`,
    );

    return success(updated, 'Time entry approved');
  }

  /**
   * Reject a time entry
   */
  async rejectEntry(data: {
    entryId: string;
    approverId: string;
    organizationId: string;
    reason: string;
  }) {
    if (!data.reason?.trim()) {
      throw new BadRequestException('Rejection reason is required');
    }

    const entry = await this.prisma.timeEntry.findFirst({
      where: {
        id: data.entryId,
        organizationId: data.organizationId,
      },
    });

    if (!entry) {
      throw new NotFoundException('Time entry not found');
    }

    if (entry.approvalStatus !== 'PENDING') {
      throw new BadRequestException(
        `Entry is already ${entry.approvalStatus.toLowerCase()}`,
      );
    }

    const updated = await this.prisma.timeEntry.update({
      where: { id: data.entryId },
      data: {
        approvalStatus: ApprovalStatus.REJECTED,
        approvedById: data.approverId,
        approvedAt: new Date(),
        approvalNotes: data.reason,
      },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    this.logger.log(
      `Entry rejected: entry=${data.entryId}, approver=${data.approverId}, reason=${data.reason}`,
    );

    return success(updated, 'Time entry rejected');
  }

  /**
   * Edit a time entry (manager correction)
   */
  async editEntry(data: {
    entryId: string;
    editorId: string;
    organizationId: string;
    clockInAt?: string;
    clockOutAt?: string;
    notes?: string;
    reason: string;
  }) {
    if (!data.reason?.trim()) {
      throw new BadRequestException('Edit reason is required');
    }

    const entry = await this.prisma.timeEntry.findFirst({
      where: {
        id: data.entryId,
        organizationId: data.organizationId,
      },
    });

    if (!entry) {
      throw new NotFoundException('Time entry not found');
    }

    const updateData: any = {
      isEdited: true,
      editedById: data.editorId,
      editedAt: new Date(),
      editReason: data.reason,
    };

    // Save original values on first edit
    if (!entry.isEdited) {
      updateData.originalClockIn = entry.clockInAt;
      updateData.originalClockOut = entry.clockOutAt;
    }

    if (data.clockInAt) {
      updateData.clockInAt = new Date(data.clockInAt);
    }

    if (data.clockOutAt) {
      updateData.clockOutAt = new Date(data.clockOutAt);
    }

    if (data.notes !== undefined) {
      updateData.notes = data.notes;
    }

    // Recalculate total minutes if times changed
    const newClockIn = updateData.clockInAt || entry.clockInAt;
    const newClockOut = updateData.clockOutAt || entry.clockOutAt;

    if (newClockOut) {
      updateData.totalMinutes = Math.round(
        (new Date(newClockOut).getTime() - new Date(newClockIn).getTime()) /
          (1000 * 60),
      );
    }

    const updated = await this.prisma.timeEntry.update({
      where: { id: data.entryId },
      data: updateData,
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true },
        },
        location: {
          select: { name: true },
        },
        editedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    this.logger.log(
      `Entry edited: entry=${data.entryId}, editor=${data.editorId}, reason=${data.reason}`,
    );

    return success(updated, 'Time entry updated');
  }

  /**
   * Bulk approve entries
   */
  async bulkApprove(data: {
    entryIds: string[];
    approverId: string;
    organizationId: string;
    notes?: string;
  }) {
    const results = {
      approved: [] as string[],
      failed: [] as { id: string; reason: string }[],
    };

    for (const entryId of data.entryIds) {
      try {
        await this.approveEntry({
          entryId,
          approverId: data.approverId,
          organizationId: data.organizationId,
          notes: data.notes,
        });
        results.approved.push(entryId);
      } catch (error: any) {
        results.failed.push({ id: entryId, reason: error.message });
      }
    }

    return success(results, `Approved ${results.approved.length} entries`);
  }
}
