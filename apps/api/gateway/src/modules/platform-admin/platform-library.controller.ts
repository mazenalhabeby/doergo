import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { assertServiceOk } from '@hbcfield/shared';
import { Public } from '../../common/decorators';
import { PlatformAuditInterceptor } from '../../common/interceptors/platform-audit.interceptor';
import { PlatformAuthGuard, RequirePlatformPerm } from '../../common/guards/platform-auth.guard';
import { LibraryTemplateDto, LibraryPublishDto, LibraryImportDto } from './dto/platform-bodies.dto';
import { PlatformLibraryService } from './platform-library.service';

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
@UseInterceptors(PlatformAuditInterceptor)
@Throttle({ default: { limit: 120, ttl: 60_000 } })
export class PlatformLibraryController {
  constructor(private readonly svc: PlatformLibraryService) {}

  private unwrap<T>(result: any): T {
    return assertServiceOk(result) as T;
  }

  @Get('templates')
  @RequirePlatformPerm('view')
  async list() {
    return this.unwrap(await this.svc.list());
  }

  @Post('templates')
  @RequirePlatformPerm('manageLibrary')
  async create(@Body() body: LibraryTemplateDto) {
    return this.unwrap(await this.svc.upsert({ ...body, id: undefined }));
  }

  @Patch('templates/:id')
  @RequirePlatformPerm('manageLibrary')
  async update(@Param('id') id: string, @Body() body: LibraryTemplateDto) {
    return this.unwrap(await this.svc.upsert({ ...body, id }));
  }

  @Patch('templates/:id/publish')
  @RequirePlatformPerm('manageLibrary')
  async publish(@Param('id') id: string, @Body() body: LibraryPublishDto) {
    return this.unwrap(await this.svc.setPublished({ id, isPublished: body?.isPublished === true }));
  }

  @Delete('templates/:id')
  @RequirePlatformPerm('manageLibrary')
  async remove(@Param('id') id: string) {
    return this.unwrap(await this.svc.remove({ id }));
  }

  /**
   * Take a copy of a real organization's task type into the library.
   *
   * The best first templates are the workflows tenants already run. It arrives
   * unpublished so a curator reads it before every tenant is offered it.
   */
  @Post('templates/import/:workflowId')
  @RequirePlatformPerm('manageLibrary')
  async importFromOrg(@Param('workflowId') workflowId: string, @Body() body: LibraryImportDto) {
    return this.unwrap(
      await this.svc.importFromOrg({ workflowId, slug: body?.slug, industry: body?.industry ?? null }),
    );
  }
}
