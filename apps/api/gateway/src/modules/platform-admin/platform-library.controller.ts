import { Body, Controller, Delete, Get, HttpException, HttpStatus, Inject, Injectable, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { Throttle } from '@nestjs/throttler';
import { BaseGatewayService, SERVICE_NAMES } from '@hbcfield/shared';
import { Public } from '../../common/decorators';
import { PlatformAuthGuard, RequirePlatformPerm } from '../../common/guards/platform-auth.guard';

/** Gateway → task-service proxy for curating the shared task-type library. */
@Injectable()
export class PlatformLibraryService extends BaseGatewayService {
  constructor(@Inject(SERVICE_NAMES.TASK) taskClient: ClientProxy) {
    super(taskClient, PlatformLibraryService.name);
  }
  list() { return this.send({ cmd: 'curate_list_workflow_templates' }, {}); }
  upsert(data: any) { return this.send({ cmd: 'curate_upsert_workflow_template' }, data); }
  setPublished(data: { id: string; isPublished: boolean }) { return this.send({ cmd: 'curate_publish_workflow_template' }, data); }
  remove(data: { id: string }) { return this.send({ cmd: 'curate_delete_workflow_template' }, data); }
  importFromOrg(data: { workflowId: string; slug?: string; industry?: string | null }) {
    return this.send({ cmd: 'curate_import_workflow_template' }, data);
  }
}

/**
 * Curating the task-type library — the only write path this table has.
 *
 * Deliberately here rather than under `/workflows`: the library belongs to the
 * platform, not to any organization, so the routes that change it sit behind
 * the platform-staff guard with no tenant JWT anywhere near them. A tenant
 * cannot reach these routes at all, which is what keeps one org's edit from
 * becoming another org's options.
 *
 * `@Public()` skips the customer JWT chain; PlatformAuthGuard then verifies the
 * staff token and each route is gated on its own capability.
 */
@Controller('platform/library')
@Public()
@UseGuards(PlatformAuthGuard)
@Throttle({ default: { limit: 120, ttl: 60_000 } })
export class PlatformLibraryController {
  constructor(private readonly svc: PlatformLibraryService) {}

  private unwrap<T>(result: any): T {
    if (result && result.success === false) {
      throw new HttpException({ message: result.message ?? 'Error' }, result.statusCode ?? HttpStatus.BAD_REQUEST);
    }
    return result;
  }

  @Get('templates')
  @RequirePlatformPerm('view')
  async list() { return this.unwrap(await this.svc.list()); }

  @Post('templates')
  @RequirePlatformPerm('manageLibrary')
  async create(@Body() body: any) { return this.unwrap(await this.svc.upsert({ ...body, id: undefined })); }

  @Patch('templates/:id')
  @RequirePlatformPerm('manageLibrary')
  async update(@Param('id') id: string, @Body() body: any) {
    return this.unwrap(await this.svc.upsert({ ...body, id }));
  }

  @Patch('templates/:id/publish')
  @RequirePlatformPerm('manageLibrary')
  async publish(@Param('id') id: string, @Body() body: { isPublished?: boolean }) {
    return this.unwrap(await this.svc.setPublished({ id, isPublished: body?.isPublished === true }));
  }

  @Delete('templates/:id')
  @RequirePlatformPerm('manageLibrary')
  async remove(@Param('id') id: string) { return this.unwrap(await this.svc.remove({ id })); }

  /**
   * Take a copy of a real organization's task type into the library.
   *
   * The best first templates are the workflows tenants already run. It arrives
   * unpublished so a curator reads it before every tenant is offered it.
   */
  @Post('templates/import/:workflowId')
  @RequirePlatformPerm('manageLibrary')
  async importFromOrg(@Param('workflowId') workflowId: string, @Body() body: { slug?: string; industry?: string }) {
    return this.unwrap(await this.svc.importFromOrg({ workflowId, slug: body?.slug, industry: body?.industry ?? null }));
  }
}
