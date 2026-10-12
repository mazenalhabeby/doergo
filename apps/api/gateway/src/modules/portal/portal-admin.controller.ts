import { DenyExternal } from '../../common/decorators';
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Request,
  Inject,
  BadRequestException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { RequirePermission, RequirePermissionInSpace, pickUnitFields } from '@hbcfield/shared';
import { join } from 'path';
import { mkdir, writeFile } from 'fs/promises';
import { AuthTokenCache } from '../../common/cache/auth-token-cache.service';
import { StorageService } from '../../common/storage/storage.service';
import { portalScope } from '../../common/portal-scope';
import { assignSpaceIds } from '../../common/task-actor';

/**
 * Office-facing multi-portal management. Org always from the token. An org can
 * run several portals; categories & residents belong to a portal (portalId in
 * the body/query).
 *
 * Three keys, each honoured PER WORKSPACE (a portal's workspace is
 * `Portal.spaceId`; a request's is its portal's):
 *
 *   canViewPortal     read a portal, its requests, its units
 *   canAnswerPortal   triage a request into live work
 *   canManagePortals  configure the portal, its categories, residents, units
 *
 * Every route is `@RequirePermissionInSpace(key)` — which only says the key is
 * held SOMEWHERE — and then narrowed in the service to the workspaces granting
 * that same key (`portalScope`: undefined = org-wide, [] = nowhere). A record
 * outside them is a 404, never a 403. An organization-level portal (no
 * workspace) is reachable with the org-wide key only.
 *
 * ⚠️ No class-level @DenyExternal any more. A client's or partner's person may
 * be given these keys for their ONE workspace (the external role builder) and
 * then reads, answers and runs that workspace's portal like anybody else. What
 * stays closed to them is decided route by route below, each with its reason:
 * creating customer ACCOUNTS / sending invitations, creating or deleting a
 * portal (billing: a workspace's second portal is a paid line).
 */
@ApiTags('portal-admin')
@ApiBearerAuth()
@Controller('portal/admin')
export class PortalAdminController {
  constructor(
    @Inject('AUTH_SERVICE') private readonly authClient: ClientProxy,
    @Inject('TASK_SERVICE') private readonly taskClient: ClientProxy,
    private readonly authCache: AuthTokenCache,
    private readonly storage: StorageService,
  ) {}

  private auth(cmd: string, payload: any) {
    return firstValueFrom(this.authClient.send({ cmd }, payload));
  }

  /** 404 unless the portal / client / unit is in the caller's reach for `manage`. */
  private assertManageReach(req: any, refs: { portalId?: string; customerId?: string; unitId?: string }) {
    return this.auth('portal_assert_reach', {
      ...refs,
      organizationId: req.user.organizationId,
      scopeSpaceIds: portalScope(req.user, 'canManagePortals'),
    });
  }

  // ── Portals ──

  @Get('portals')
  @RequirePermissionInSpace('canViewPortal')
  @ApiOperation({ summary: 'List the org’s portals (those in the caller’s workspaces)' })
  listPortals(@Request() req: any) {
    return this.auth('portal_list', {
      organizationId: req.user.organizationId,
      scopeSpaceIds: portalScope(req.user, 'canViewPortal'),
    });
  }

  @Post('portals')
  // An ORGANIZATION-level portal (no workspace): only the org-wide key reaches
  // one, so only the org-wide key creates one. Closed to externals — a portal
  // is a billed line on the organization's bill, and an external member has no
  // claim on what the organization buys.
  @RequirePermission('canManagePortals')
  @DenyExternal()
  @ApiOperation({ summary: 'Create a portal (from a template)' })
  createPortal(@Body() body: { templateKey?: string; name?: string }, @Request() req: any) {
    return this.auth('portal_create', {
      templateKey: body?.templateKey,
      name: body?.name,
      organizationId: req.user.organizationId,
    });
  }

  @Get('portals/:id')
  @RequirePermissionInSpace('canViewPortal')
  @ApiOperation({ summary: 'Get a portal (config + categories)' })
  getPortal(@Param('id') id: string, @Request() req: any) {
    return this.auth('portal_get', {
      id,
      organizationId: req.user.organizationId,
      scopeSpaceIds: portalScope(req.user, 'canViewPortal'),
    });
  }

  @Get('portals/:id/requests')
  @RequirePermissionInSpace('canViewPortal')
  @ApiOperation({ summary: 'List every request in a portal (all clients)' })
  portalRequests(@Param('id') id: string, @Request() req: any) {
    return firstValueFrom(
      this.taskClient.send(
        { cmd: 'portal_list_requests_by_portal' },
        {
          organizationId: req.user.organizationId,
          portalId: id,
          scopeSpaceIds: portalScope(req.user, 'canViewPortal'),
        },
      ),
    );
  }

  /** Upload a portal cover/hero image (shown as the client-home background). */
  @Post('portals/:id/cover')
  @RequirePermissionInSpace('canManagePortals')
  @ApiOperation({ summary: 'Upload the portal cover/hero image' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 8 * 1024 * 1024, files: 1 } }))
  async uploadCover(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Request() req: any,
  ) {
    if (!file) throw new BadRequestException('No file provided');
    if (file.size > 8 * 1024 * 1024) throw new BadRequestException('File too large (max 8MB)');
    // Validate the portal id BEFORE it enters a filesystem path. Express decodes
    // %2e%2e%2f in path params, so an unvalidated id (e.g. "../../../app") would
    // let mkdir/writeFile escape the uploads root → arbitrary file write. (Sec
    // audit C4.) A cuid/uuid is alphanumeric with optional -/_; nothing else.
    if (!/^[a-zA-Z0-9_-]{8,64}$/.test(id)) {
      throw new BadRequestException('Invalid portal id');
    }
    // Extension derived from the validated MIME, never the client filename — the
    // dir is served by express.static (Content-Type follows the extension), so a
    // filename-derived .html/.svg would be stored XSS on the app origin. (C3.)
    const MIME_EXT: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
    };
    const ext = MIME_EXT[file.mimetype];
    if (!ext) {
      throw new BadRequestException('Invalid file type. Only JPEG, PNG, and WebP are allowed.');
    }
    // Reach BEFORE the bytes are stored: the setter below would refuse a portal
    // outside the caller's workspaces, but only after the file had been written
    // under that portal's key.
    await this.assertManageReach(req, { portalId: id });
    // Object storage so any gateway replica can serve it — see StorageService.
    const fileName = `${Date.now()}.${ext}`;
    let coverImageUrl: string;
    if (this.storage.isConfigured) {
      coverImageUrl = await this.storage.uploadPublicImage(
        `portals/${id}/${fileName}`,
        file.buffer,
        file.mimetype,
      );
    } else {
      const dir = join(process.cwd(), 'uploads', 'portals', id);
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, fileName), file.buffer);
      coverImageUrl = `/uploads/portals/${id}/${fileName}`;
    }
    await this.auth('portal_update', {
      id,
      organizationId: req.user.organizationId,
      coverImageUrl,
      scopeSpaceIds: portalScope(req.user, 'canManagePortals'),
    });
    return { success: true, data: { coverImageUrl } };
  }

  /** Remove the portal cover image. */
  @Delete('portals/:id/cover')
  @RequirePermissionInSpace('canManagePortals')
  @ApiOperation({ summary: 'Remove the portal cover image' })
  removeCover(@Param('id') id: string, @Request() req: any) {
    return this.auth('portal_update', {
      id,
      organizationId: req.user.organizationId,
      coverImageUrl: null,
      scopeSpaceIds: portalScope(req.user, 'canManagePortals'),
    });
  }

  /** Route a pending request → a live task: pick space + flow + priority + worker. */
  @Post('requests/:id/triage')
  // Answering. The guard reads `body.spaceId` (the destination), so the key must
  // be held THERE; the service also checks the request's own portal is in reach.
  @RequirePermissionInSpace('canAnswerPortal')
  @ApiOperation({ summary: 'Triage a portal request into a live task' })
  triageRequest(
    @Param('id') id: string,
    @Body() body: { spaceId: string; workflowId?: string | null; priority?: string; assignedToId?: string | null },
    @Request() req: any,
  ) {
    const scopeSpaceIds = portalScope(req.user, 'canAnswerPortal');
    return firstValueFrom(
      this.taskClient.send(
        { cmd: 'portal_triage_request' },
        {
          id,
          organizationId: req.user.organizationId,
          userId: req.user.id,
          spaceId: body.spaceId,
          workflowId: body.workflowId,
          priority: body.priority,
          assignedToId: body.assignedToId,
          scopeSpaceIds,
          // Naming the worker is ASSIGNING, its own permission. Asked only of a
          // workspace-scoped answerer — an org-wide one keeps what routing a
          // request has always allowed.
          // (The flat flag first: it carries an org-wide grant `access.org` may
          // not spell out, exactly as `portalScope` reads its own key.)
          ...(scopeSpaceIds === undefined || req.user?.canAssignTasks === true
            ? {}
            : { assignScopeSpaceIds: assignSpaceIds(req) }),
        },
      ),
    );
  }

  @Patch('portals/:id')
  // Configuration. `body.spaceId` (moving the portal) is read by the guard and
  // re-checked by the service: a scoped manager cannot carry it out of reach.
  @RequirePermissionInSpace('canManagePortals')
  @ApiOperation({ summary: 'Update a portal (name / switch type)' })
  updatePortal(
    @Param('id') id: string,
    @Body() body: { name?: string; templateKey?: string; reseed?: boolean; spaceId?: string | null },
    @Request() req: any,
  ) {
    // Whitelisted: a spread body also carried `coverImageUrl` (any string, onto
    // a page every resident opens) — the cover has its own upload route.
    return this.auth('portal_update', {
      name: body?.name,
      templateKey: body?.templateKey,
      reseed: body?.reseed,
      ...(body && 'spaceId' in body ? { spaceId: body.spaceId ?? null } : {}),
      id,
      organizationId: req.user.organizationId,
      scopeSpaceIds: portalScope(req.user, 'canManagePortals'),
    });
  }

  @Delete('portals/:id')
  // Closed to externals: deleting a portal cuts every resident's app off and
  // changes the organization's bill — neither is a client's person to decide.
  @RequirePermissionInSpace('canManagePortals')
  @DenyExternal()
  @ApiOperation({ summary: 'Delete a portal' })
  deletePortal(@Param('id') id: string, @Request() req: any) {
    return this.auth('portal_delete', {
      id,
      organizationId: req.user.organizationId,
      scopeSpaceIds: portalScope(req.user, 'canManagePortals'),
    });
  }

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

  // ── Residents (B2C, per portal) ──

  @Get('residents')
  // The resident register (names, email, phone) is the portal's management
  // surface — the invite/remove screen — not the request inbox. Answerers see
  // who sent a request on the request itself.
  @RequirePermissionInSpace('canManagePortals')
  @ApiOperation({ summary: 'List a portal’s residents' })
  async residents(@Query('portalId') portalId: string | undefined, @Query('search') search: string | undefined, @Request() req: any) {
    const scopeSpaceIds = portalScope(req.user, 'canManagePortals');
    if (scopeSpaceIds !== undefined) {
      // Workspace-scoped: the CRM list below knows nothing about portal reach,
      // so the portal is checked HERE first — and without one, "every resident
      // of every portal" is an org-wide question.
      if (!portalId) throw new BadRequestException('Pick a portal');
      await this.assertManageReach(req, { portalId });
    }
    return this.auth('list_customers', { organizationId: req.user.organizationId, portalResident: true, portalId, search, limit: 100 });
  }

  @Get('portals/:id/available-units')
  @RequirePermissionInSpace('canManagePortals')
  @ApiOperation({ summary: "Vacant apartments in the portal's space, for the invite picker" })
  availableUnits(@Param('id') id: string, @Request() req: any) {
    return this.auth('portal_list_available_units', {
      organizationId: req.user.organizationId,
      portalId: id,
      scopeSpaceIds: portalScope(req.user, 'canManagePortals'),
    });
  }

  @Get('portals/:id/available-customers')
  @RequirePermissionInSpace('canManagePortals')
  @ApiOperation({ summary: "Existing CRM customers (non-residents) in the portal's space, for the invite picker" })
  availableCustomers(@Param('id') id: string, @Request() req: any) {
    return this.auth('portal_list_assignable_customers', {
      organizationId: req.user.organizationId,
      portalId: id,
      scopeSpaceIds: portalScope(req.user, 'canManagePortals'),
    });
  }

  @Post('residents')
  // Closed to externals: this creates (or promotes) a client record AND issues a
  // customer ACCOUNT invitation — the organization deciding who gets into its
  // app. Workspace-scoped internal managers may, for a portal in reach.
  @RequirePermissionInSpace('canManagePortals')
  @DenyExternal()
  @ApiOperation({ summary: 'Invite a resident into a portal (assign an existing apartment or create one + invite code)' })
  async inviteResident(
    @Body() body: { portalId: string; customerId?: string; name?: string; email?: string; unitId?: string; unitName?: string; unitAddress?: string },
    @Request() req: any,
  ) {
    const orgId = req.user.organizationId;
    const scopeSpaceIds = portalScope(req.user, 'canManagePortals');
    // Every id the body names, in reach, BEFORE anything is created: the CRM and
    // invitation calls below are org-scoped only.
    if (!body?.portalId) throw new BadRequestException('Pick a portal');
    await this.assertManageReach(req, { portalId: body.portalId, customerId: body.customerId, unitId: body.unitId });
    // Promote an EXISTING CRM customer into the portal, or create a new one.
    // Name is optional for new — the resident sets their own name on register.
    let customer: any;
    if (body.customerId) {
      const updRes: any = await this.auth('update_customer', {
        id: body.customerId,
        organizationId: orgId,
        actorId: req.user.id,
        dto: { isPortalResident: true, portalId: body.portalId, ...(body.email ? { email: body.email } : {}) },
      });
      customer = updRes?.data ?? updRes;
    } else {
      const initialName = body.name?.trim() || body.unitName?.trim() || 'Pending client';
      const customerRes: any = await this.auth('create_customer', {
        organizationId: orgId,
        dto: { name: initialName, email: body.email, isPortalResident: true, portalId: body.portalId },
      });
      customer = customerRes?.data ?? customerRes;
    }
    // Assign an EXISTING vacant apartment, or create a new one from free text.
    const unit: any = body.unitId
      ? await this.auth('portal_update_unit', {
          id: body.unitId, organizationId: orgId,
          customerId: customer.id, portalId: body.portalId, isPrimary: true,
          scopeSpaceIds,
        })
      : await this.auth('portal_create_unit', {
          organizationId: orgId,
          customerId: customer.id,
          portalId: body.portalId,
          name: body.unitName?.trim() || 'Unit',
          address: body.unitAddress,
          scopeSpaceIds,
        });
    const inviteRes: any = await this.auth('create_invitation', {
      targetRole: 'CUSTOMER',
      organizationId: orgId,
      createdById: req.user.id,
      creatorRole: req.user.role,
      customerId: customer.id,
      unitId: unit.id,
      portalId: body.portalId,
      email: body.email,
    });
    return { customer, unit, code: inviteRes?.data?.code, invite: inviteRes };
  }

  @Post('residents/:customerId/resend-invite')
  // Closed to externals: sends a customer-account invitation (see above).
  @RequirePermissionInSpace('canManagePortals')
  @DenyExternal()
  @ApiOperation({ summary: "Re-send a pending client's invite by email" })
  async resendResidentInvite(@Param('customerId') customerId: string, @Request() req: any) {
    await this.assertManageReach(req, { customerId });
    return this.auth('resend_invitation', {
      organizationId: req.user.organizationId,
      customerId,
    });
  }

  @Delete('residents/:customerId')
  // Closed to externals: revokes a customer ACCOUNT (their app login).
  @RequirePermissionInSpace('canManagePortals')
  @DenyExternal()
  @ApiOperation({ summary: 'Remove a client from the portal (revokes app access, detaches, vacates units)' })
  async removeResident(@Param('customerId') customerId: string, @Request() req: any) {
    const result: any = await this.auth('portal_remove_client', {
      organizationId: req.user.organizationId,
      customerId,
      scopeSpaceIds: portalScope(req.user, 'canManagePortals'),
    });
    // Instantly revoke the deactivated logins (don't wait for the 60s token-cache TTL).
    const ids: string[] = result?.data?.deactivatedUserIds ?? [];
    await Promise.all(ids.map((uid) => this.authCache.invalidateUser(uid).catch(() => undefined)));
    return result;
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

  // ── A resident's requests (office view) ──

  @Get('requests')
  @RequirePermissionInSpace('canViewPortal')
  @ApiOperation({ summary: "List a resident's portal requests" })
  requests(@Query('customerId') customerId: string, @Request() req: any) {
    return firstValueFrom(
      this.taskClient.send(
        { cmd: 'portal_list_requests' },
        {
          organizationId: req.user.organizationId,
          customerId,
          scopeSpaceIds: portalScope(req.user, 'canViewPortal'),
        },
      ),
    );
  }
}
