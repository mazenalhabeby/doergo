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
  BadRequestException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { RequirePermission, RequirePermissionInSpace } from '@hbcfield/shared';
import { join } from 'path';
import { mkdir, writeFile } from 'fs/promises';
import { portalScope } from '../../common/portal-scope';
import { assignSpaceIds } from '../../common/task-actor';
import { ServiceCalls } from '../../common/microservices/service-calls';
import { StorageService } from '../../common/storage/storage.service';
import { PortalAdminCalls } from './portal-admin-calls';
import { portalList, portalCreate, portalGet, portalUpdate, portalDelete } from '@hbcfield/shared/microservices';
import {
  portalListRequestsByPortal,
  portalListWaitingRequests,
  portalTriageRequest,
  portalListRequests,
} from '@hbcfield/shared/microservices';

import type { AuthedRequest } from '../../common/request.types';
import { callerOrgId } from '../../common/caller-org';
import { CreatePortalDto, TriageRequestDto, UpdatePortalDto } from './dto/portal-bodies.dto';
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
    private readonly services: ServiceCalls,
    private readonly storage: StorageService,
    private readonly portalAuth: PortalAdminCalls,
  ) {}

  // ── Portals ──

  @Get('portals')
  @RequirePermissionInSpace('canViewPortal')
  @ApiOperation({ summary: 'List the org’s portals (those in the caller’s workspaces)' })
  listPortals(@Request() req: AuthedRequest) {
    return this.portalAuth.ask(portalList, {
      organizationId: callerOrgId(req.user),
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
  createPortal(@Body() body: CreatePortalDto, @Request() req: AuthedRequest) {
    return this.portalAuth.ask(portalCreate, {
      templateKey: body?.templateKey,
      name: body?.name,
      organizationId: callerOrgId(req.user),
    });
  }

  @Get('portals/:id')
  @RequirePermissionInSpace('canViewPortal')
  @ApiOperation({ summary: 'Get a portal (config + categories)' })
  getPortal(@Param('id') id: string, @Request() req: AuthedRequest) {
    return this.portalAuth.ask(portalGet, {
      id,
      organizationId: callerOrgId(req.user),
      scopeSpaceIds: portalScope(req.user, 'canViewPortal'),
    });
  }

  @Get('portals/:id/requests')
  @RequirePermissionInSpace('canViewPortal')
  @ApiOperation({ summary: 'List every request in a portal (all clients)' })
  portalRequests(@Param('id') id: string, @Request() req: AuthedRequest) {
    return this.services.task.ask(portalListRequestsByPortal, {
      organizationId: callerOrgId(req.user),
      portalId: id,
      scopeSpaceIds: portalScope(req.user, 'canViewPortal'),
    });
  }

  @Get('requests/waiting')
  @RequirePermissionInSpace('canViewPortal')
  @ApiOperation({ summary: 'Requests waiting for triage across the portals the caller reads (approvals inbox)' })
  waitingRequests(@Request() req: AuthedRequest) {
    // The same gate and scope as portals/:id/requests, over every portal the caller reads.
    return this.services.task.ask(portalListWaitingRequests, {
      organizationId: callerOrgId(req.user),
      scopeSpaceIds: portalScope(req.user, 'canViewPortal'),
    });
  }

  /** Upload a portal cover/hero image (shown as the client-home background). */
  @Post('portals/:id/cover')
  @RequirePermissionInSpace('canManagePortals')
  @ApiOperation({ summary: 'Upload the portal cover/hero image' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 8 * 1024 * 1024, files: 1 } }))
  async uploadCover(@Param('id') id: string, @UploadedFile() file: Express.Multer.File, @Request() req: AuthedRequest) {
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
    await this.portalAuth.assertManageReach(req, { portalId: id });
    // Object storage so any gateway replica can serve it — see StorageService.
    const fileName = `${Date.now()}.${ext}`;
    let coverImageUrl: string;
    if (this.storage.isConfigured) {
      coverImageUrl = await this.storage.uploadPublicImage(`portals/${id}/${fileName}`, file.buffer, file.mimetype);
    } else {
      const dir = join(process.cwd(), 'uploads', 'portals', id);
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, fileName), file.buffer);
      coverImageUrl = `/uploads/portals/${id}/${fileName}`;
    }
    await this.portalAuth.ask(portalUpdate, {
      id,
      organizationId: callerOrgId(req.user),
      coverImageUrl,
      scopeSpaceIds: portalScope(req.user, 'canManagePortals'),
    });
    return { success: true, data: { coverImageUrl } };
  }

  /** Remove the portal cover image. */
  @Delete('portals/:id/cover')
  @RequirePermissionInSpace('canManagePortals')
  @ApiOperation({ summary: 'Remove the portal cover image' })
  removeCover(@Param('id') id: string, @Request() req: AuthedRequest) {
    return this.portalAuth.ask(portalUpdate, {
      id,
      organizationId: callerOrgId(req.user),
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
  triageRequest(@Param('id') id: string, @Body() body: TriageRequestDto, @Request() req: AuthedRequest) {
    const scopeSpaceIds = portalScope(req.user, 'canAnswerPortal');
    return this.services.task.ask(portalTriageRequest, {
      id,
      organizationId: callerOrgId(req.user),
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
    });
  }

  @Patch('portals/:id')
  // Configuration. `body.spaceId` (moving the portal) is read by the guard and
  // re-checked by the service: a scoped manager cannot carry it out of reach.
  @RequirePermissionInSpace('canManagePortals')
  @ApiOperation({ summary: 'Update a portal (name / switch type)' })
  updatePortal(@Param('id') id: string, @Body() body: UpdatePortalDto, @Request() req: AuthedRequest) {
    // Whitelisted: a spread body also carried `coverImageUrl` (any string, onto
    // a page every resident opens) — the cover has its own upload route.
    return this.portalAuth.ask(portalUpdate, {
      name: body?.name,
      templateKey: body?.templateKey,
      reseed: body?.reseed,
      // `!== undefined`, not `in`: a DTO class declares every field, so `in` is always true.
      ...(body?.spaceId !== undefined ? { spaceId: body.spaceId ?? null } : {}),
      id,
      organizationId: callerOrgId(req.user),
      scopeSpaceIds: portalScope(req.user, 'canManagePortals'),
    });
  }

  @Delete('portals/:id')
  // Closed to externals: deleting a portal cuts every resident's app off and
  // changes the organization's bill — neither is a client's person to decide.
  @RequirePermissionInSpace('canManagePortals')
  @DenyExternal()
  @ApiOperation({ summary: 'Delete a portal' })
  deletePortal(@Param('id') id: string, @Request() req: AuthedRequest) {
    return this.portalAuth.ask(portalDelete, {
      id,
      organizationId: callerOrgId(req.user),
      scopeSpaceIds: portalScope(req.user, 'canManagePortals'),
    });
  }

  // ── A resident's requests (office view) ──

  @Get('requests')
  @RequirePermissionInSpace('canViewPortal')
  @ApiOperation({ summary: "List a resident's portal requests" })
  requests(@Query('customerId') customerId: string, @Request() req: AuthedRequest) {
    return this.services.task.ask(portalListRequests, {
      organizationId: callerOrgId(req.user),
      customerId,
      scopeSpaceIds: portalScope(req.user, 'canViewPortal'),
    });
  }
}
