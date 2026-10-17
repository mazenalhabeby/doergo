import { Controller, Get, Post, Param, Query, Body, Inject, ForbiddenException, UseInterceptors } from '@nestjs/common';
import { LabourCostInterceptor } from '../../common/interceptors/labour-cost.interceptor';
import { ClientProxy } from '@nestjs/microservices';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { firstValueFrom } from 'rxjs';
import { Role, SERVICE_NAMES, CurrentUser, CurrentUserData, RequirePermissionInSpace } from '@hbcfield/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { DenyExternal } from '../../common/decorators/deny-external.decorator';
import { leaveWriteScope, leaveReadScope } from './employees-controller-helpers';

/**
 * /employees — the leave ledger: opening balances and adjustments. ⚠️ Registered
 * before EmployeesController (GET leave-opening vs GET :id).
 */
@ApiTags('employees')
@ApiBearerAuth()
@UseInterceptors(LabourCostInterceptor)
@Controller('employees')
export class LeaveLedgerController {
  constructor(@Inject(SERVICE_NAMES.TASK) private readonly taskClient: ClientProxy) {}

  // ============================================================================
  // THE LEAVE LEDGER (shared leave/leave-ledger.ts) — before /:id routes
  //
  // Writing somebody's balance is deciding their leave: the same permission and scope as
  // approving it (`canManageRota`, narrowed to the person's workspaces in task-service), and
  // nobody adjusts their own (an organization administrator excepted). Every write is also a
  // line in the ledger itself, with who and when — and in the audit log (audit-helpers.ts).
  // ============================================================================

  @Get('leave-opening')
  @DenyExternal()
  @ApiOperation({ summary: 'Starting balances: members in scope with what is saved for the leave year containing `on`' })
  @RequirePermissionInSpace('canManageRota')
  async getLeaveOpening(@Query('on') on: string | undefined, @CurrentUser() user: CurrentUserData) {
    return firstValueFrom(
      this.taskClient.send({ cmd: 'get_leave_opening' }, {
        organizationId: user.organizationId,
        scopeSpaceIds: leaveWriteScope(user),
        on: typeof on === 'string' ? on.slice(0, 10) : undefined,
      }),
    );
  }

  @Post('leave-opening/match')
  @DenyExternal()
  @ApiOperation({ summary: 'Read a pasted table and match each line to a member (email, then full name). Writes nothing.' })
  @RequirePermissionInSpace('canManageRota')
  async matchLeaveOpening(@Body() body: { text?: string }, @CurrentUser() user: CurrentUserData) {
    return firstValueFrom(
      this.taskClient.send({ cmd: 'match_leave_opening' }, {
        organizationId: user.organizationId,
        scopeSpaceIds: leaveWriteScope(user),
        text: body?.text,
      }),
    );
  }

  @Post('leave-opening')
  @DenyExternal()
  @ApiOperation({ summary: 'Save starting balances (used before HBCField, carried) — one transaction, ≤ 500 people' })
  @RequirePermissionInSpace('canManageRota')
  async saveLeaveOpening(
    @Body() body: { on?: string; rows?: Array<{ userId: string; used: number; carried: number }> },
    @CurrentUser() user: CurrentUserData,
  ) {
    return firstValueFrom(
      this.taskClient.send({ cmd: 'save_leave_opening' }, {
        organizationId: user.organizationId,
        callerId: user.id,
        scopeSpaceIds: leaveWriteScope(user),
        on: body?.on,
        rows: body?.rows,
      }),
    );
  }

  @Post('leave-adjustments/:adjustmentId/void')
  @DenyExternal()
  @ApiOperation({ summary: 'Undo a ledger line — it stays visible and counts for nothing' })
  @ApiParam({ name: 'adjustmentId', description: 'Ledger line ID' })
  @RequirePermissionInSpace('canManageRota')
  async voidLeaveAdjustment(@Param('adjustmentId') adjustmentId: string, @CurrentUser() user: CurrentUserData) {
    return firstValueFrom(
      this.taskClient.send({ cmd: 'void_leave_adjustment' }, {
        adjustmentId,
        organizationId: user.organizationId,
        callerId: user.id,
        scopeSpaceIds: leaveWriteScope(user),
      }),
    );
  }

  @Get(':id/leave-adjustments')
  @ApiOperation({ summary: "One leave year's ledger lines (who, when, why). A member reads their own." })
  @ApiParam({ name: 'id', description: 'Employee ID' })
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  async listLeaveAdjustments(
    @Param('id') id: string,
    @Query('on') on: string | undefined,
    @Query('year') year: string | undefined,
    @CurrentUser() user: CurrentUserData,
  ) {
    const scope = leaveReadScope(user);
    if (user.id !== id && scope !== undefined && scope.length === 0) throw new ForbiddenException('You can only view your own leave balance');
    const write = (user as { isExternal?: boolean }).isExternal ? [] : leaveWriteScope(user);
    return firstValueFrom(
      this.taskClient.send({ cmd: 'list_leave_adjustments' }, {
        technicianId: id,
        organizationId: user.organizationId,
        callerId: user.id,
        scopeSpaceIds: scope,
        // Only to answer `canEdit` — 'ORG' because an undefined key does not survive the transport.
        editScope: write === undefined ? 'ORG' : write.length ? write : null,
        on: typeof on === 'string' ? on.slice(0, 10) : undefined,
        year,
      }),
    );
  }

  @Post(':id/leave-adjustments')
  @DenyExternal()
  @ApiOperation({ summary: 'Add a ledger line: used before HBCField, a correction, or extra days granted' })
  @ApiParam({ name: 'id', description: 'Employee ID' })
  @RequirePermissionInSpace('canManageRota')
  async addLeaveAdjustment(
    @Param('id') id: string,
    @Body() body: { kind?: string; days?: number; on?: string; reason?: string | null },
    @CurrentUser() user: CurrentUserData,
  ) {
    return firstValueFrom(
      this.taskClient.send({ cmd: 'add_leave_adjustment' }, {
        technicianId: id,
        organizationId: user.organizationId,
        callerId: user.id,
        scopeSpaceIds: leaveWriteScope(user),
        // Read in task-service with the shared parseLeaveAdjustment — never trusted here.
        body: { kind: body?.kind, days: body?.days, on: body?.on, reason: body?.reason },
      }),
    );
  }
}
