import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Role } from '@hbcfield/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  CreateCustomFieldDto,
  UpdateCustomFieldDto,
  SetCustomFieldValuesDto,
} from './dto';
import { CustomFieldsService } from './custom-fields.service';

@ApiTags('custom-fields')
@ApiBearerAuth()
@Controller('custom-fields')
export class CustomFieldsController {
  constructor(private readonly customFieldsService: CustomFieldsService) {}

  @Get()
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'List organization custom field definitions' })
  async findAll(@Request() req: any) {
    return this.customFieldsService.findAll({
      organizationId: req.user.organizationId,
    });
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create a custom field definition' })
  async create(@Body() dto: CreateCustomFieldDto, @Request() req: any) {
    return this.customFieldsService.create({
      ...dto,
      organizationId: req.user.organizationId,
    });
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update a custom field definition' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateCustomFieldDto,
    @Request() req: any,
  ) {
    return this.customFieldsService.update({
      id,
      ...dto,
      organizationId: req.user.organizationId,
    });
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete a custom field definition' })
  async remove(@Param('id') id: string, @Request() req: any) {
    return this.customFieldsService.remove({
      id,
      organizationId: req.user.organizationId,
    });
  }
}

@ApiTags('tasks')
@ApiBearerAuth()
@Controller('tasks')
export class TaskCustomFieldsController {
  constructor(private readonly customFieldsService: CustomFieldsService) {}

  @Get(':id/custom-fields')
  @Roles(Role.ADMIN, Role.MANAGER, Role.EMPLOYEE)
  @ApiOperation({ summary: "Get a task's custom field values" })
  async getTaskValues(@Param('id') taskId: string, @Request() req: any) {
    return this.customFieldsService.getTaskValues({
      taskId,
      organizationId: req.user.organizationId,
    });
  }

  @Patch(':id/custom-fields')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: "Set/update a task's custom field values (batch)" })
  async setTaskValues(
    @Param('id') taskId: string,
    @Body() dto: SetCustomFieldValuesDto,
    @Request() req: any,
  ) {
    return this.customFieldsService.setTaskValues({
      taskId,
      organizationId: req.user.organizationId,
      values: dto.values,
    });
  }
}
