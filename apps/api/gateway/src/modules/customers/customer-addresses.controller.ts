import { Controller, Get, Post, Patch, Delete, Body, Param, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { pickUnitFields } from '@hbcfield/shared';
import { CustomersControllerBase } from './customers-controller.base';

/** /customers/:id — a client's addresses and its activity timeline. */
@ApiTags('customers')
@ApiBearerAuth()
@Controller('customers')
export class CustomerAddressesController extends CustomersControllerBase {
  // ── Addresses (a customer's units; one is primary → shown on the map) ──
  // Read gated by CRM reach (get_customer enforces it); writes stay manager-only
  // in Phase 1 (address editing for scoped members is a follow-up).
  @Get(':id/addresses')
  async listAddresses(@Param('id') id: string, @Request() req: any) {
    // Enforce the caller may reach this client before exposing its units.
    await this.auth('get_customer', { id, organizationId: req.user.organizationId, caller: this.caller(req) });
    return this.auth('portal_list_units', { organizationId: req.user.organizationId, customerId: id });
  }

  /*
    Address WRITES carry the caller as `crmCaller`: the portal service then asks
    the CRM's own reach rule (view-all, or own / co-manage this client, plus
    editInfo) before touching a unit. `crmEditInfo` alone let a rep scoped to
    their own clients edit any client's addresses by id. No route-level
    `crmEditInfo` any more: it read the ORG-wide flag and refused a member whose
    edit right is a workspace's — the service decides on the client's own
    workspace (org ∪ that workspace's grant). Identity goes LAST and
    the body is whitelisted (`pickUnitFields`, no relations): an address edits
    its own text and pin, never which client, space or portal it belongs to.
  */
  @Post(':id/addresses')
  addAddress(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      address?: string;
      lat?: number;
      lng?: number;
      isPrimary?: boolean;
      contactName?: string;
      contactPhone?: string;
    },
    @Request() req: any,
  ) {
    const fields = pickUnitFields(body, { relations: false });
    return this.auth('portal_create_unit', {
      ...fields,
      name: body?.name?.trim() || body?.address || 'Address',
      organizationId: req.user.organizationId,
      customerId: id,
      crmCaller: this.caller(req),
    });
  }

  @Patch(':id/addresses/:unitId')
  updateAddress(@Param('id') id: string, @Param('unitId') unitId: string, @Body() body: any, @Request() req: any) {
    // scopeCustomerId binds the unit to THIS customer (no cross-customer edits).
    return this.auth('portal_update_unit', {
      ...pickUnitFields(body, { relations: false }),
      id: unitId,
      organizationId: req.user.organizationId,
      scopeCustomerId: id,
      actorId: req.user.id,
      crmCaller: this.caller(req),
    });
  }

  @Post(':id/addresses/:unitId/primary')
  setPrimaryAddress(@Param('id') id: string, @Param('unitId') unitId: string, @Request() req: any) {
    return this.auth('portal_set_primary_unit', {
      id: unitId,
      organizationId: req.user.organizationId,
      customerId: id,
      crmCaller: this.caller(req),
    });
  }

  @Delete(':id/addresses/:unitId')
  deleteAddress(@Param('id') id: string, @Param('unitId') unitId: string, @Request() req: any) {
    return this.auth('portal_delete_unit', {
      id: unitId,
      organizationId: req.user.organizationId,
      customerId: id,
      crmCaller: this.caller(req),
    });
  }

  // ── CRM activity timeline (service enforces reach + work cap) ──
  @Get(':id/activities')
  @ApiOperation({ summary: "A customer's CRM timeline (notes, calls, reminders, status)" })
  listActivities(@Param('id') id: string, @Request() req: any) {
    return this.auth('list_customer_activities', {
      customerId: id,
      organizationId: req.user.organizationId,
      caller: this.caller(req),
    });
  }

  @Post(':id/activities')
  @ApiOperation({ summary: 'Log an activity / note / reminder on a customer' })
  addActivity(
    @Param('id') id: string,
    @Body()
    body: {
      id?: string;
      type?: string;
      body?: string;
      dueAt?: string;
      reminderKind?: string;
      remindBeforeMin?: number;
      reminderAssigneeId?: string | null;
      repeat?: string;
    },
    @Request() req: any,
  ) {
    return this.authMutation(
      'add_customer_activity',
      {
        clientId: body.id,
        customerId: id,
        organizationId: req.user.organizationId,
        authorId: req.user.id,
        type: body.type,
        body: body.body,
        dueAt: body.dueAt,
        reminderKind: body.reminderKind,
        remindBeforeMin: body.remindBeforeMin,
        reminderAssigneeId: body.reminderAssigneeId,
        repeat: body.repeat,
        caller: this.caller(req),
      },
      req.user.organizationId,
      id,
    );
  }

  @Patch(':id/activities/:activityId')
  updateActivity(
    @Param('id') id: string,
    @Param('activityId') activityId: string,
    @Body()
    body: {
      body?: string;
      dueAt?: string | null;
      done?: boolean;
      reminderKind?: string;
      remindBeforeMin?: number;
      reminderAssigneeId?: string | null;
      repeat?: string;
    },
    @Request() req: any,
  ) {
    return this.authMutation(
      'update_customer_activity',
      {
        id: activityId,
        customerId: id,
        organizationId: req.user.organizationId,
        body: body.body,
        dueAt: body.dueAt,
        done: body.done,
        reminderKind: body.reminderKind,
        remindBeforeMin: body.remindBeforeMin,
        reminderAssigneeId: body.reminderAssigneeId,
        repeat: body.repeat,
        caller: this.caller(req),
      },
      req.user.organizationId,
      id,
    );
  }

  @Delete(':id/activities/:activityId')
  deleteActivity(@Param('id') id: string, @Param('activityId') activityId: string, @Request() req: any) {
    return this.authMutation(
      'delete_customer_activity',
      { id: activityId, customerId: id, organizationId: req.user.organizationId, caller: this.caller(req) },
      req.user.organizationId,
      id,
    );
  }
}
