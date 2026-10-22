import { NotFoundException } from '@nestjs/common';
import { success, assertFoundInOrg } from '@hbcfield/shared';
import { PrismaService } from '@hbcfield/shared';
import { assertSpaceInOrg } from '../../common/tenant-scope.util';
import type { PlanningItemInputMessage } from '@hbcfield/shared/microservices';

const WITH_TASK_COUNT = { _count: { select: { tasks: true } } } as const;
/** A day sent as text: empty or absent clears it. */
const day = (v?: string | null) => (v ? new Date(v) : null);

/** What every planning item (an epic, a phase) carries. */
export type PlanningItemInput = PlanningItemInputMessage;

/**
 * The board's planning items — epics and phases — are the same record with a
 * different second date and one field of their own. The two services were ~150
 * lines each, line for line; this holds the shared part, and a subclass names
 * its model and adds only its own fields and their validation.
 */
export abstract class PlanningItemService {
  constructor(protected readonly prisma: PrismaService) {}

  /** The Prisma model, which is also the task's link column (`${model}Id`). */
  protected abstract readonly model: 'epic' | 'phase';
  /** "Epic", "Phase" — for "not found" and "deleted". */
  protected abstract readonly label: string;
  protected abstract readonly defaultColor: string;

  private get rows(): any {
    return (this.prisma)[this.model];
  }

  /**
   * One item by id, scoped to its organization. Kept lean for the gateway's
   * module guard, which needs the SPACE a mutation happens in, in front of
   * every mutation. Not found and not yours answer alike.
   */
  async findOne(data: { id: string; organizationId: string }) {
    const row = await this.rows.findFirst({
      where: { id: data.id, organizationId: data.organizationId },
      select: { id: true, spaceId: true, organizationId: true },
    });
    if (!row) throw new NotFoundException('Not found');
    return success(row);
  }

  async findAll(data: { organizationId: string; spaceId?: string; limit?: number; offset?: number }) {
    const items = await this.rows.findMany({
      where: {
        organizationId: data.organizationId,
        // A space sees its own plus the organization-wide ones. Null spaceId
        // means organization-wide — what every pre-existing row is, so without
        // the null arm this would have emptied every board.
        ...(data.spaceId ? { OR: [{ spaceId: data.spaceId }, { spaceId: null }] } : {}),
      },
      orderBy: { position: 'asc' },
      take: data.limit || 100,
      skip: data.offset || 0,
      include: WITH_TASK_COUNT,
    });
    return success(items);
  }

  /** Create with the shared fields; `own` adds the subclass's, `validate` runs after the space check. */
  protected async createItem(
    data: PlanningItemInput & { name: string; spaceId?: string | null; organizationId: string },
    own: Record<string, unknown>,
    validate?: () => void,
  ) {
    // The space id comes from the body: it must be this organization's, and live (tenant-scope.util).
    await assertSpaceInOrg(this.prisma, data.spaceId, data.organizationId, { activeOnly: true });
    validate?.();

    let position = data.position;
    if (position === undefined || position === null) {
      const last = await this.rows.findFirst({
        where: { organizationId: data.organizationId },
        orderBy: { position: 'desc' },
        select: { position: true },
      });
      position = (last?.position ?? -1) + 1;
    }

    const item = await this.rows.create({
      data: {
        spaceId: data.spaceId ?? null,
        name: data.name,
        description: data.description,
        color: data.color || this.defaultColor,
        startDate: day(data.startDate),
        ...own,
        position,
        organizationId: data.organizationId,
      },
      include: WITH_TASK_COUNT,
    });
    return success(item);
  }

  /** Update the shared fields that were sent; `own` adds the subclass's, `validate` runs after the ownership check. */
  protected async updateItem(
    data: PlanningItemInput & { id: string; organizationId: string },
    own: Record<string, unknown>,
    validate?: () => void,
  ) {
    const existing = await this.rows.findUnique({ where: { id: data.id } });
    assertFoundInOrg(existing, data.organizationId, this.label);
    validate?.();

    const item = await this.rows.update({
      where: { id: data.id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.color !== undefined && { color: data.color }),
        ...(data.startDate !== undefined && { startDate: day(data.startDate) }),
        ...(data.position !== undefined && { position: data.position }),
        ...own,
      },
      include: WITH_TASK_COUNT,
    });
    return success(item);
  }

  /** Delete one — its tasks are unlinked first, never deleted. */
  async remove(data: { id: string; organizationId: string }) {
    const existing = await this.rows.findUnique({ where: { id: data.id } });
    assertFoundInOrg(existing, data.organizationId, this.label);
    await this.prisma.task.updateMany({
      where: { [`${this.model}Id`]: data.id },
      data: { [`${this.model}Id`]: null },
    });
    await this.rows.delete({ where: { id: data.id } });
    return success(null, `${this.label} deleted successfully`);
  }
}

/** A day field's update: only when sent, and empty clears it. */
export const dayUpdate = (key: string, v: string | undefined) => (v !== undefined ? { [key]: day(v) } : {});
/** A plain field's update: only when sent. */
export const fieldUpdate = (key: string, v: unknown) => (v !== undefined ? { [key]: v } : {});
export { day as planningDay };
