import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Role } from '@doergo/shared';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        organizationId: true,
        isActive: true,
        createdAt: true,
        organization: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return { success: true, data: user };
  }

  async getWorkers(organizationId?: string) {
    const where: any = { role: Role.TECHNICIAN, isActive: true };

    if (organizationId) {
      where.organizationId = organizationId;
    }

    const workers = await this.prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        organizationId: true,
        lastLocation: true,
      },
    });

    return { success: true, data: workers };
  }

  async getWorkerTasks(workerId: string) {
    const tasks = await this.prisma.task.findMany({
      where: { assignedToId: workerId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        dueDate: true,
        locationAddress: true,
        createdAt: true,
      },
    });

    return { success: true, data: tasks };
  }
}
