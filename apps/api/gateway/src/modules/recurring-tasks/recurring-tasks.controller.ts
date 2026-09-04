import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Role, spacesGranting, isAdmin } from '@hbcfield/shared';
import { RequirePermission, RequirePermissionInSpace } from '../../common/decorators';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePlan } from '../../common/decorators/require-plan.decorator';
import { CreateRecurringTaskDto, UpdateRecurringTaskDto } from './dto';
import { RecurringTasksService } from './recurring-tasks.service';

@ApiTags('recurring-tasks')
@ApiBearerAuth()
@RequirePlan('recurring') // Professional+ (write routes; reads pass through)
@Controller('recurring-tasks')
export class RecurringTasksController {
  constructor(private readonly recurringTasksService: RecurringTasksService) {}

  @Get()
  /*
    Space-aware. A template names the space its tasks are created in, so the
    repeating work at a site is part of running it — and the gate asked the
    org-wide column, so a supervisor saw none of it.

    Narrowed in the query on the indexed `spaceId`. undefined = org-wide;
    [] = granted nowhere and matches nothing.
  */
  @RequirePermissionInSpace('canViewAllTasks')
  @ApiOperation({ summary: 'List organization recurring task templates' })
  async findAll(@Request() req: any) {
    return this.recurringTasksService.findAll({
      organizationId: req.user.organizationId,
      scopeSpaceIds: isAdmin(req.user)
        ? undefined
        : (spacesGranting(req.user?.access, 'canViewAllTasks') ?? undefined),
    });
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create a recurring task template' })
  async create(@Body() dto: CreateRecurringTaskDto, @Request() req: any) {
    return this.recurringTasksService.create({
      ...dto,
      organizationId: req.user.organizationId,
      createdById: req.user.id,
    });
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update a recurring task template' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateRecurringTaskDto,
    @Request() req: any,
  ) {
    return this.recurringTasksService.update({
      id,
      ...dto,
      organizationId: req.user.organizationId,
    });
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete a recurring task template' })
  async remove(@Param('id') id: string, @Request() req: any) {
    return this.recurringTasksService.remove({
      id,
      organizationId: req.user.organizationId,
    });
  }

  @Post(':id/generate')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Manually trigger task generation from template' })
  async generate(@Param('id') id: string, @Request() req: any) {
    return this.recurringTasksService.generate({
      id,
      organizationId: req.user.organizationId,
      userId: req.user.id,
    });
  }
}
