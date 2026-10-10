import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PlanningItemService, dayUpdate, fieldUpdate, planningDay, type PlanningItemInput } from '../../common/planning-items';

const VALID_EPIC_STATUSES = ['OPEN', 'IN_PROGRESS', 'DONE'];

/** Epics: a planning item with a status and a target date (common/planning-items). */
@Injectable()
export class EpicsService extends PlanningItemService {
  protected readonly model = 'epic' as const;
  protected readonly label = 'Epic';
  protected readonly defaultColor = '#8b5cf6';

  constructor(prisma: PrismaService) {
    super(prisma);
  }

  /** Created inside a space → it belongs there. Omitted → organization-wide. */
  create(data: PlanningItemInput & { name: string; spaceId?: string | null; targetDate?: string; organizationId: string }) {
    return this.createItem(data, { targetDate: planningDay(data.targetDate) });
  }

  update(data: PlanningItemInput & { id: string; organizationId: string; status?: string; targetDate?: string }) {
    return this.updateItem(
      data,
      { ...fieldUpdate('status', data.status), ...dayUpdate('targetDate', data.targetDate) },
      () => {
        if (data.status && !VALID_EPIC_STATUSES.includes(data.status)) {
          throw new BadRequestException(`Status must be one of: ${VALID_EPIC_STATUSES.join(', ')}`);
        }
      },
    );
  }
}
