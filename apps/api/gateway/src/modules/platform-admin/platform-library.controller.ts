import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Injectable,
  Param,
  Patch,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { Throttle } from '@nestjs/throttler';
import { BaseGatewayService, SERVICE_NAMES, assertServiceOk } from '@hbcfield/shared';
import { Public } from '../../common/decorators';
import { PlatformAuditInterceptor } from '../../common/interceptors/platform-audit.interceptor';
import { PlatformAuthGuard, RequirePlatformPerm } from '../../common/guards/platform-auth.guard';
import {
  pattern,
  curateDeleteWorkflowTemplate,
  curateImportWorkflowTemplate,
  curateListWorkflowTemplates,
  curatePublishWorkflowTemplate,
  curateUpsertWorkflowTemplate,
  type RpcRequest,
} from '@hbcfield/shared/microservices';

/** Gateway → task-service proxy for curating the shared task-type library. */
@Injectable()
export class PlatformLibraryService extends BaseGatewayService {
  constructor(@Inject(SERVICE_NAMES.TASK) taskClient: ClientProxy) {
    super(taskClient, PlatformLibraryService.name);
  }
  list() {
    return this.send(pattern(curateListWorkflowTemplates), {} satisfies RpcRequest<typeof curateListWorkflowTemplates>);
  }
  upsert(data: RpcRequest<typeof curateUpsertWorkflowTemplate>) {
    return this.send(pattern(curateUpsertWorkflowTemplate), data);
  }
  setPublished(data: { id: string; isPublished: boolean }) {
    return this.send(
      pattern(curatePublishWorkflowTemplate),
      data satisfies RpcRequest<typeof curatePublishWorkflowTemplate>,
    );
  }
  remove(data: { id: string }) {
    return this.send(
      pattern(curateDeleteWorkflowTemplate),
      data satisfies RpcRequest<typeof curateDeleteWorkflowTemplate>,
    );
  }
  importFromOrg(data: { workflowId: string; slug?: string; industry?: string | null }) {
    return this.send(
      pattern(curateImportWorkflowTemplate),
      data satisfies RpcRequest<typeof curateImportWorkflowTemplate>,
    );
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
  async create(@Body() body: Omit<Parameters<PlatformLibraryService['upsert']>[0], 'id'>) {
    return this.unwrap(await this.svc.upsert({ ...body, id: undefined }));
  }

  @Patch('templates/:id')
  @RequirePlatformPerm('manageLibrary')
  async update(@Param('id') id: string, @Body() body: Omit<Parameters<PlatformLibraryService['upsert']>[0], 'id'>) {
    return this.unwrap(await this.svc.upsert({ ...body, id }));
  }

  @Patch('templates/:id/publish')
  @RequirePlatformPerm('manageLibrary')
  async publish(@Param('id') id: string, @Body() body: { isPublished?: boolean }) {
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
  async importFromOrg(@Param('workflowId') workflowId: string, @Body() body: { slug?: string; industry?: string }) {
    return this.unwrap(
      await this.svc.importFromOrg({ workflowId, slug: body?.slug, industry: body?.industry ?? null }),
    );
  }
}
