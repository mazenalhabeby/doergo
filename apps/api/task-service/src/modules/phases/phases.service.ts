import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PlanningItemService, dayUpdate, fieldUpdate, planningDay, type PlanningItemInput } from '../../common/planning-items';

const PHASE_TYPES = ['phase', 'milestone'];
const assertPhaseType = (type?: string) => {
  if (type && !PHASE_TYPES.includes(type)) throw new BadRequestException('Type must be "phase" or "milestone"');
};

/** Phases: a planning item with a type (phase | milestone), an end date and an active switch (common/planning-items). */
@Injectable()
export class PhasesService extends PlanningItemService {
  protected readonly model = 'phase' as const;
  protected readonly label = 'Phase';
  protected readonly defaultColor = '#3b82f6';

  constructor(prisma: PrismaService) {
    super(prisma);
  }

  /** Created inside a space → it belongs there. Omitted → organization-wide. */
  create(data: PlanningItemInput & { name: string; spaceId?: string | null; type?: string; endDate?: string; organizationId: string }) {
    return this.createItem(
      data,
      { type: data.type || 'phase', endDate: planningDay(data.endDate) },
      () => assertPhaseType(data.type),
    );
  }

  update(data: PlanningItemInput & { id: string; organizationId: string; type?: string; endDate?: string; isActive?: boolean }) {
    return this.updateItem(
      data,
      { ...fieldUpdate('type', data.type), ...dayUpdate('endDate', data.endDate), ...fieldUpdate('isActive', data.isActive) },
      () => assertPhaseType(data.type),
    );
  }
}
