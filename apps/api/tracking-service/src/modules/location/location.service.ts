import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class LocationService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject('NOTIFICATION_SERVICE') private readonly notificationClient: ClientProxy,
  ) {}

  async updateLocation(userId: string, lat: number, lng: number, accuracy?: number) {
    // Upsert worker's last location
    const location = await this.prisma.workerLastLocation.upsert({
      where: { userId },
      update: { lat, lng, accuracy },
      create: { userId, lat, lng, accuracy },
    });

    // Emit location update event to notification service
    this.notificationClient.emit('worker_location_updated', {
      workerId: userId,
      location: { lat, lng, accuracy, timestamp: new Date() },
    });

    return { success: true, data: location };
  }

  async getActiveWorkers(organizationId?: string) {
    const where: any = {
      user: {
        role: 'TECHNICIAN',
        isActive: true,
      },
    };

    if (organizationId) {
      where.user.organizationId = organizationId;
    }

    // Get workers with recent location updates (within last 30 minutes)
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

    const locations = await this.prisma.workerLastLocation.findMany({
      where: {
        ...where,
        updatedAt: { gte: thirtyMinutesAgo },
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            organizationId: true,
          },
        },
      },
    });

    return {
      success: true,
      data: locations.map((loc) => ({
        workerId: loc.userId,
        worker: loc.user,
        lat: loc.lat,
        lng: loc.lng,
        accuracy: loc.accuracy,
        lastUpdate: loc.updatedAt,
      })),
    };
  }

  async getWorkerLocation(workerId: string) {
    const location = await this.prisma.workerLastLocation.findUnique({
      where: { userId: workerId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!location) {
      return { success: true, data: null };
    }

    return {
      success: true,
      data: {
        workerId: location.userId,
        worker: location.user,
        lat: location.lat,
        lng: location.lng,
        accuracy: location.accuracy,
        lastUpdate: location.updatedAt,
      },
    };
  }

  async getWorkerHistory(workerId: string, startDate?: string, endDate?: string) {
    // For location history, we would need a separate LocationHistory model
    // For MVP, we only store the last known location
    // This would be implemented with a time-series database or location history table

    const location = await this.getWorkerLocation(workerId);

    return {
      success: true,
      data: location.data ? [location.data] : [],
      message: 'Location history requires additional setup. Currently returning last known location only.',
    };
  }
}
