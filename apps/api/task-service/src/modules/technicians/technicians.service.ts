import { assertMemberInScope, paginated } from '@hbcfield/shared';
import { Injectable } from '@nestjs/common';
import { TaskStatus, success } from '@hbcfield/shared';
import { GetEmployeeStatsDto, GetEmployeeTaskHistoryDto } from './dto';
import { MemberServiceBase } from './member-service.base';

@Injectable()
export class TechniciansService extends MemberServiceBase {
  /**
   * Get basic stats for an employee
   */
  async getStats(dto: GetEmployeeStatsDto) {
    // A space-granted caller may only read their own crew. The route takes a
    // member id straight from the caller, so this is the boundary.
    await assertMemberInScope(this.prisma, {
      userId: dto.id,
      organizationId: dto.organizationId,
      scopeSpaceIds: (dto as { scopeSpaceIds?: string[] }).scopeSpaceIds,
    });
    const { id, organizationId } = dto;

    // Aggregate in the DB instead of loading every task and counting in JS (M5).
    // One grouped count by status (served by the [assignedToId, status] index) +
    // one filtered count for on-time completions (field-ref updatedAt <= dueDate).
    const [statusGroups, completedOnTime] = await Promise.all([
      this.prisma.task.groupBy({
        by: ['status'],
        where: { assignedToId: id, organizationId },
        _count: { _all: true },
      }),
      this.prisma.task.count({
        where: {
          assignedToId: id,
          organizationId,
          status: { in: [TaskStatus.COMPLETED, TaskStatus.CLOSED] },
          // On-time = no due date, or finished (updatedAt) on/before the due date.
          OR: [
            { dueDate: null },
            { updatedAt: { lte: this.prisma.task.fields.dueDate } },
          ],
        },
      }),
    ]);

    const countByStatus = new Map<string, number>();
    for (const g of statusGroups) countByStatus.set(g.status, g._count._all);
    const c = (s: TaskStatus) => countByStatus.get(s) || 0;

    const total = [...countByStatus.values()].reduce((a, b) => a + b, 0);
    const completed = c(TaskStatus.COMPLETED) + c(TaskStatus.CLOSED);
    const inProgress =
      c(TaskStatus.IN_PROGRESS) +
      c(TaskStatus.ACCEPTED) +
      c(TaskStatus.EN_ROUTE) +
      c(TaskStatus.ARRIVED);
    const blocked = c(TaskStatus.BLOCKED);

    return success({
      total,
      completed,
      inProgress,
      blocked,
      completionRate: total > 0 ? (completed / total) * 100 : 0,
      onTimeRate: completed > 0 ? (completedOnTime / completed) * 100 : 0,
    });
  }

  /**
   * Get task history for an employee
   */
  async getTaskHistory(dto: GetEmployeeTaskHistoryDto) {
    // A space-granted caller may only read their own crew. The route takes a
    // member id straight from the caller, so this is the boundary.
    await assertMemberInScope(this.prisma, {
      userId: dto.id,
      organizationId: dto.organizationId,
      scopeSpaceIds: (dto as { scopeSpaceIds?: string[] }).scopeSpaceIds,
    });
    const { id, organizationId, status, page = 1, limit = 20 } = dto;
    const { startDate, endDate } = dto as { startDate?: string; endDate?: string };

    const where: any = {
      assignedToId: id,
      organizationId,
    };

    if (status) {
      where.status = status as TaskStatus;
    }

    /*
      An optional due-date window, for "what is already booked for this person
      while they want to be away". Without it the leave drawer would have to
      pull a page of their history and hope the future-dated jobs were on it —
      which for anybody with a long history they would not be.
    */
    if (startDate || endDate) {
      where.dueDate = {
        ...(startDate ? { gte: new Date(`${startDate}T00:00:00.000Z`) } : {}),
        ...(endDate ? { lte: new Date(`${endDate}T23:59:59.999Z`) } : {}),
      };
    }

    const [tasks, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          createdBy: {
            select: { id: true, firstName: true, lastName: true },
          },
          asset: {
            select: { id: true, name: true },
          },
        },
      }),
      this.prisma.task.count({ where }),
    ]);

    return paginated(tasks, { page, limit, total });
  }
}
