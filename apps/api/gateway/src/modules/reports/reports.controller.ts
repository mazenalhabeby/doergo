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
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { Role } from '@doergo/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { ReportsService } from './reports.service';
import { ReportsQueueService } from './reports.queue.service';
import { CompleteTaskDto, UpdateReportDto } from './dto';

@ApiTags('reports')
@ApiBearerAuth()
@Controller()
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly reportsQueueService: ReportsQueueService,
  ) {}

  // ============ Task Completion (Main Flow) ============

  @Post('tasks/:taskId/complete')
  @Roles(Role.TECHNICIAN)
  @ApiOperation({ summary: 'Complete a task with service report (TECHNICIAN only)' })
  @ApiParam({ name: 'taskId', description: 'Task ID to complete' })
  async completeTask(
    @Param('taskId') taskId: string,
    @Body() dto: CompleteTaskDto,
    @Request() req: any,
  ) {
    return this.reportsQueueService.completeTask({
      taskId,
      ...dto,
      userId: req.user.id,
      userRole: req.user.role,
      organizationId: req.user.organizationId,
    });
  }

  // ============ Report READ Operations ============

  @Get('tasks/:taskId/report')
  @Roles(Role.ADMIN, Role.DISPATCHER, Role.TECHNICIAN)
  @ApiOperation({ summary: 'Get service report for a task' })
  @ApiParam({ name: 'taskId', description: 'Task ID' })
  async getTaskReport(@Param('taskId') taskId: string, @Request() req: any) {
    return this.reportsService.getTaskReport({
      taskId,
      userId: req.user.id,
      userRole: req.user.role,
      organizationId: req.user.organizationId,
    });
  }

  @Get('assets/:assetId/reports')
  @Roles(Role.ADMIN, Role.DISPATCHER)
  @ApiOperation({ summary: 'Get maintenance history (service reports) for an asset' })
  @ApiParam({ name: 'assetId', description: 'Asset ID' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async getAssetReports(
    @Param('assetId') assetId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Request() req?: any,
  ) {
    return this.reportsService.getAssetReports({
      assetId,
      page,
      limit,
      userId: req.user.id,
      userRole: req.user.role,
      organizationId: req.user.organizationId,
    });
  }

  // ============ Report UPDATE Operations ============

  @Patch('reports/:id')
  @Roles(Role.TECHNICIAN)
  @ApiOperation({ summary: 'Update a service report (TECHNICIAN only, within 24 hours)' })
  @ApiParam({ name: 'id', description: 'Report ID' })
  async updateReport(
    @Param('id') id: string,
    @Body() dto: UpdateReportDto,
    @Request() req: any,
  ) {
    return this.reportsQueueService.updateReport({
      reportId: id,
      ...dto,
      userId: req.user.id,
      userRole: req.user.role,
      organizationId: req.user.organizationId,
    });
  }

  // ============ Attachment Operations ============

  @Post('reports/:id/attachments/presign')
  @Roles(Role.TECHNICIAN)
  @ApiOperation({ summary: 'Get presigned URL for uploading attachment' })
  @ApiParam({ name: 'id', description: 'Report ID' })
  async getPresignedUrl(
    @Param('id') id: string,
    @Body() body: { fileName: string; fileType: string },
    @Request() req: any,
  ) {
    return this.reportsQueueService.getPresignedUrl({
      reportId: id,
      fileName: body.fileName,
      fileType: body.fileType,
      userId: req.user.id,
      userRole: req.user.role,
      organizationId: req.user.organizationId,
    });
  }

  @Post('reports/:id/attachments')
  @Roles(Role.TECHNICIAN)
  @ApiOperation({ summary: 'Confirm attachment upload (after S3 upload)' })
  @ApiParam({ name: 'id', description: 'Report ID' })
  async addAttachment(
    @Param('id') id: string,
    @Body() body: {
      type: 'BEFORE' | 'AFTER';
      fileName: string;
      fileUrl: string;
      fileSize: number;
      caption?: string;
    },
    @Request() req: any,
  ) {
    return this.reportsQueueService.addAttachment({
      reportId: id,
      ...body,
      userId: req.user.id,
      userRole: req.user.role,
      organizationId: req.user.organizationId,
    });
  }

  @Delete('reports/:id/attachments/:attachmentId')
  @Roles(Role.TECHNICIAN)
  @ApiOperation({ summary: 'Delete an attachment from a report' })
  @ApiParam({ name: 'id', description: 'Report ID' })
  @ApiParam({ name: 'attachmentId', description: 'Attachment ID' })
  async deleteAttachment(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @Request() req: any,
  ) {
    return this.reportsQueueService.deleteAttachment({
      reportId: id,
      attachmentId,
      userId: req.user.id,
      userRole: req.user.role,
      organizationId: req.user.organizationId,
    });
  }

  // ============ Parts Operations ============

  @Post('reports/:id/parts')
  @Roles(Role.TECHNICIAN)
  @ApiOperation({ summary: 'Add a part to a report' })
  @ApiParam({ name: 'id', description: 'Report ID' })
  async addPart(
    @Param('id') id: string,
    @Body() body: {
      name: string;
      partNumber?: string;
      quantity: number;
      unitCost?: number;
      notes?: string;
    },
    @Request() req: any,
  ) {
    return this.reportsQueueService.addPart({
      reportId: id,
      ...body,
      userId: req.user.id,
      userRole: req.user.role,
      organizationId: req.user.organizationId,
    });
  }

  @Patch('reports/:id/parts/:partId')
  @Roles(Role.TECHNICIAN)
  @ApiOperation({ summary: 'Update a part on a report' })
  @ApiParam({ name: 'id', description: 'Report ID' })
  @ApiParam({ name: 'partId', description: 'Part ID' })
  async updatePart(
    @Param('id') id: string,
    @Param('partId') partId: string,
    @Body() body: {
      name?: string;
      partNumber?: string;
      quantity?: number;
      unitCost?: number;
      notes?: string;
    },
    @Request() req: any,
  ) {
    return this.reportsQueueService.updatePart({
      reportId: id,
      partId,
      ...body,
      userId: req.user.id,
      userRole: req.user.role,
      organizationId: req.user.organizationId,
    });
  }

  @Delete('reports/:id/parts/:partId')
  @Roles(Role.TECHNICIAN)
  @ApiOperation({ summary: 'Delete a part from a report' })
  @ApiParam({ name: 'id', description: 'Report ID' })
  @ApiParam({ name: 'partId', description: 'Part ID' })
  async deletePart(
    @Param('id') id: string,
    @Param('partId') partId: string,
    @Request() req: any,
  ) {
    return this.reportsQueueService.deletePart({
      reportId: id,
      partId,
      userId: req.user.id,
      userRole: req.user.role,
      organizationId: req.user.organizationId,
    });
  }
}
