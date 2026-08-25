import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators';
import { RequirePlan } from '../../common/decorators/require-plan.decorator';
import { ShiftsService } from './shifts.service';

/**
 * Shift definitions + the rota (member → shift). All mutations require
 * canManageUsers; organizationId is always taken from the caller's token.
 * Tier-gated: shift scheduling is a Professional+ capability (write routes 402
 * under-tier; reads pass so a downgraded org still sees its config).
 */
@ApiTags('shifts')
@ApiBearerAuth()
@RequirePlan('shift_scheduling')
@Controller()
export class ShiftsController {
  constructor(private readonly service: ShiftsService) {}

  // ── Shifts ──
  @Get('shifts')
  @RequirePermission('canManageRota')
  @ApiOperation({ summary: 'List shift definitions (optionally scoped to a space)' })
  listShifts(@Query('spaceId') spaceId: string | undefined, @Request() req: any) {
    return this.service.listShifts({ organizationId: req.user.organizationId, spaceId });
  }

  @Post('shifts')
  @RequirePermission('canManageRota')
  @ApiOperation({ summary: 'Create a shift definition' })
  createShift(@Body() body: any, @Request() req: any) {
    return this.service.createShift({ ...body, organizationId: req.user.organizationId });
  }

  @Patch('shifts/:id')
  @RequirePermission('canManageRota')
  @ApiOperation({ summary: 'Update a shift definition' })
  updateShift(@Param('id') shiftId: string, @Body() body: any, @Request() req: any) {
    return this.service.updateShift({ ...body, shiftId, organizationId: req.user.organizationId });
  }

  @Delete('shifts/:id')
  @RequirePermission('canManageRota')
  @ApiOperation({ summary: 'Delete a shift definition' })
  deleteShift(@Param('id') shiftId: string, @Request() req: any) {
    return this.service.deleteShift({ shiftId, organizationId: req.user.organizationId });
  }

  // ── Rota (assignments) ──
  @Get('spaces/:spaceId/rota')
  @RequirePermission('canManageRota')
  @ApiOperation({ summary: 'List the rota for a space' })
  listAssignments(
    @Param('spaceId') spaceId: string,
    @Query('includeEnded') includeEnded: string | undefined,
    @Request() req: any,
  ) {
    return this.service.listAssignments({
      organizationId: req.user.organizationId,
      spaceId,
      includeEnded: includeEnded === 'true',
    });
  }

  @Post('spaces/:spaceId/rota')
  @RequirePermission('canManageRota')
  @ApiOperation({ summary: 'Assign a member to a shift in a space' })
  createAssignment(@Param('spaceId') spaceId: string, @Body() body: any, @Request() req: any) {
    return this.service.createAssignment({
      ...body,
      spaceId,
      organizationId: req.user.organizationId,
      createdById: req.user.id,
    });
  }

  @Patch('rota/:id')
  @RequirePermission('canManageRota')
  @ApiOperation({ summary: 'Update a rota assignment' })
  updateAssignment(@Param('id') assignmentId: string, @Body() body: any, @Request() req: any) {
    return this.service.updateAssignment({ ...body, assignmentId, organizationId: req.user.organizationId });
  }

  @Delete('rota/:id')
  @RequirePermission('canManageRota')
  @ApiOperation({ summary: 'Remove a rota assignment' })
  deleteAssignment(@Param('id') assignmentId: string, @Request() req: any) {
    return this.service.deleteAssignment({ assignmentId, organizationId: req.user.organizationId });
  }
}
