import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { RequirePermissionInSpace } from '@hbcfield/shared';
import { portalScope } from '../../common/portal-scope';
import { unitFieldsFor } from '../../common/unit-fields';
import { PortalAdminControllerBase } from './portal-admin-controller.base';
import {
  portalCreateCategory,
  portalUpdateCategory,
  portalDeleteCategory,
  portalReorderCategories,
  portalCreateUnit,
  portalUpdateUnit,
  portalDeleteUnit,
  portalAdminListUnits,
  type RpcRequest,
} from '@hbcfield/shared/microservices';

import type { AuthedRequest } from '../../common/request.types';
import { callerOrgId } from '../../common/caller-org';
import { CreatePortalCategoryDto, UpdatePortalCategoryDto, ReorderPortalCategoriesDto } from './dto/portal-bodies.dto';
import { UnitBodyDto } from '../../common/dto/unit-body.dto';
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
  createCategory(@Body() body: CreatePortalCategoryDto, @Request() req: AuthedRequest) {
    return this.auth(portalCreateCategory, {
      ...body,
      organizationId: callerOrgId(req.user),
      scopeSpaceIds: portalScope(req.user, 'canManagePortals'),
    });
  }

  @Patch('categories/:id')
  @RequirePermissionInSpace('canManagePortals')
  updateCategory(@Param('id') id: string, @Body() body: UpdatePortalCategoryDto, @Request() req: AuthedRequest) {
    return this.auth(portalUpdateCategory, {
      ...body,
      id,
      organizationId: callerOrgId(req.user),
      scopeSpaceIds: portalScope(req.user, 'canManagePortals'),
    });
  }

  @Delete('categories/:id')
  @RequirePermissionInSpace('canManagePortals')
  deleteCategory(@Param('id') id: string, @Request() req: AuthedRequest) {
    return this.auth(portalDeleteCategory, {
      id,
      organizationId: callerOrgId(req.user),
      scopeSpaceIds: portalScope(req.user, 'canManagePortals'),
    });
  }

  @Post('categories/reorder')
  @RequirePermissionInSpace('canManagePortals')
  reorderCategories(@Body() body: ReorderPortalCategoriesDto, @Request() req: AuthedRequest) {
    return this.auth(portalReorderCategories, {
      portalId: body?.portalId,
      orderedIds: Array.isArray(body?.orderedIds) ? body.orderedIds : [],
      organizationId: callerOrgId(req.user),
      scopeSpaceIds: portalScope(req.user, 'canManagePortals'),
    });
  }

  // ── Unit CRUD (per resident) ──

  @Post('units')
  @RequirePermissionInSpace('canManagePortals')
  createUnit(@Body() body: UnitBodyDto, @Request() req: AuthedRequest) {
    // Whitelisted like every unit route (pickUnitFields); identity last.
    return this.auth(portalCreateUnit, {
      ...unitFieldsFor(portalCreateUnit, body),
      // The body is unchecked here; `address` is used as sent, whatever it is (as before).
      name: (typeof body?.name === 'string' && body.name.trim()) || (body?.address as string) || 'Unit',
      organizationId: callerOrgId(req.user),
      actorId: req.user.id,
      scopeSpaceIds: portalScope(req.user, 'canManagePortals'),
    });
  }

  @Patch('units/:id')
  @RequirePermissionInSpace('canManagePortals')
  updateUnit(@Param('id') id: string, @Body() body: UnitBodyDto, @Request() req: AuthedRequest) {
    // Whitelisted: a spread body could carry scopeCustomerId, actorId or a CRM caller.
    return this.auth(portalUpdateUnit, {
      ...unitFieldsFor(portalUpdateUnit, body),
      id,
      organizationId: callerOrgId(req.user),
      actorId: req.user.id,
      scopeSpaceIds: portalScope(req.user, 'canManagePortals'),
    });
  }

  @Delete('units/:id')
  @RequirePermissionInSpace('canManagePortals')
  deleteUnit(@Param('id') id: string, @Request() req: AuthedRequest) {
    return this.auth(portalDeleteUnit, {
      id,
      organizationId: callerOrgId(req.user),
      scopeSpaceIds: portalScope(req.user, 'canManagePortals'),
    });
  }

  @Get('units')
  @RequirePermissionInSpace('canViewPortal')
  listUnits(@Query('customerId') customerId: string | undefined, @Request() req: AuthedRequest) {
    return this.auth(portalAdminListUnits, {
      organizationId: callerOrgId(req.user),
      customerId,
      scopeSpaceIds: portalScope(req.user, 'canViewPortal'),
    });
  }
}
