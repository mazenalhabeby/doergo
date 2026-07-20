import { Controller, Get, Post, Body, Inject, Request } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { firstValueFrom } from 'rxjs';
import { SERVICE_NAMES } from '@hbcfield/shared';
import { RequirePermission } from '../../common/decorators';

@ApiTags('analytics')
@ApiBearerAuth()
@Controller('analytics')
export class AnalyticsController {
  constructor(@Inject(SERVICE_NAMES.TASK) private readonly taskClient: ClientProxy) {}

  @Get('catalog')
  @RequirePermission('canViewAllTasks')
  @ApiOperation({ summary: 'Report builder catalog: datasets (dimensions/measures) + templates' })
  async catalog() {
    return firstValueFrom(this.taskClient.send({ cmd: 'analytics_catalog' }, {}));
  }

  @Post('run')
  @RequirePermission('canViewAllTasks')
  @ApiOperation({ summary: 'Run a report definition (always scoped to your organization)' })
  async run(@Body() body: { definition: unknown }, @Request() req: any) {
    return firstValueFrom(
      this.taskClient.send({ cmd: 'analytics_run' }, {
        organizationId: req.user.organizationId,
        definition: body?.definition,
      }),
    );
  }
}
