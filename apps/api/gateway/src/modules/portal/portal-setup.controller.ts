import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { RequirePermissionInSpace, pickUnitFields } from '@hbcfield/shared';
import { portalScope } from '../../common/portal-scope';
import { PortalAdminControllerBase } from './portal-admin-controller.base';

/** /portal/admin — a portal's request categories and its units. */
@ApiTags('portal-admin')
@ApiBearerAuth()
@Controller('portal/admin')
export class PortalSetupController extends PortalAdminControllerBase {

  // ── Intake categories (per portal) ──
  // Reach is the category's PORTAL's workspace; a routing `spaceId` in the body
  // is a target and must be in reach too (guard + service).

  @Post('categories')
  @RequirePermissionInSpace('canManagePortals')
  createCategory(@Body() body: any, @Request() req: any) {
    return this.auth('portal_create_category', {
      ...body,
      organizationId: req.user.organizationId,
      scopeSpaceIds: portalScope(req.user, 'canManagePortals'),
    });
  }

  @Patch('categories/:id')
  @RequirePermissionInSpace('canManagePortals')
  updateCategory(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.auth('portal_update_category', {
      ...body,
      id,
      organizationId: req.user.organizationId,
      scopeSpaceIds: portalScope(req.user, 'canManagePortals'),
    });
  }

  @Delete('categories/:id')
  @RequirePermissionInSpace('canManagePortals')
  deleteCategory(@Param('id') id: string, @Request() req: any) {
    return this.auth('portal_delete_category', {
      id,
      organizationId: req.user.organizationId,
      scopeSpaceIds: portalScope(req.user, 'canManagePortals'),
    });
  }

  @Post('categories/reorder')
  @RequirePermissionInSpace('canManagePortals')
  reorderCategories(@Body() body: { portalId: string; orderedIds: string[] }, @Request() req: any) {
    return this.auth('portal_reorder_categories', {
      portalId: body?.portalId,
      orderedIds: Array.isArray(body?.orderedIds) ? body.orderedIds : [],
      organizationId: req.user.organizationId,
      scopeSpaceIds: portalScope(req.user, 'canManagePortals'),
    });
  }

  // ── Unit CRUD (per resident) ──

  @Post('units')
  @RequirePermissionInSpace('canManagePortals')
  createUnit(@Body() body: any, @Request() req: any) {
    // Whitelisted like every unit route (pickUnitFields); identity last.
    return this.auth('portal_create_unit', {
      ...pickUnitFields(body),
      name: (typeof body?.name === 'string' && body.name.trim()) || body?.address || 'Unit',
      organizationId: req.user.organizationId, actorId: req.user.id,
      scopeSpaceIds: portalScope(req.user, 'canManagePortals'),
    });
  }

  @Patch('units/:id')
  @RequirePermissionInSpace('canManagePortals')
  updateUnit(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    // Whitelisted: a spread body could carry scopeCustomerId, actorId or a CRM caller.
    return this.auth('portal_update_unit', {
      ...pickUnitFields(body), id, organizationId: req.user.organizationId, actorId: req.user.id,
      scopeSpaceIds: portalScope(req.user, 'canManagePortals'),
    });
  }

  @Delete('units/:id')
  @RequirePermissionInSpace('canManagePortals')
  deleteUnit(@Param('id') id: string, @Request() req: any) {
    return this.auth('portal_delete_unit', {
      id,
      organizationId: req.user.organizationId,
      scopeSpaceIds: portalScope(req.user, 'canManagePortals'),
    });
  }

  @Get('units')
  @RequirePermissionInSpace('canViewPortal')
  listUnits(@Query('customerId') customerId: string | undefined, @Request() req: any) {
    return this.auth('portal_admin_list_units', {
      organizationId: req.user.organizationId,
      customerId,
      scopeSpaceIds: portalScope(req.user, 'canViewPortal'),
    });
  }
}
