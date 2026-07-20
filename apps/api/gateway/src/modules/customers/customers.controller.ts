import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Inject,
  Request,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { firstValueFrom } from 'rxjs';
import { RequirePermission } from '../../common/decorators';

interface CustomerDto {
  name?: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
  isActive?: boolean;
}

@ApiTags('customers')
@ApiBearerAuth()
@Controller('customers')
export class CustomersController {
  constructor(@Inject('AUTH_SERVICE') private readonly authClient: ClientProxy) {}

  @Get()
  @RequirePermission('canViewAllTasks')
  @ApiOperation({ summary: 'List customers for the organization' })
  async list(
    @Request() req: any,
    @Query('search') search?: string,
    @Query('status') status?: 'active' | 'inactive' | 'all',
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return firstValueFrom(
      this.authClient.send({ cmd: 'list_customers' }, {
        organizationId: req.user.organizationId,
        search,
        status,
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
      }),
    );
  }

  @Get(':id/statement')
  @RequirePermission('canViewAllTasks')
  @ApiOperation({ summary: 'Customer service statement (completed jobs + hours) for a period' })
  async statement(
    @Param('id') id: string,
    @Request() req: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return firstValueFrom(
      this.authClient.send({ cmd: 'get_customer_statement' }, { id, organizationId: req.user.organizationId, from, to }),
    );
  }

  @Get(':id')
  @RequirePermission('canViewAllTasks')
  @ApiOperation({ summary: 'Get a customer' })
  async get(@Param('id') id: string, @Request() req: any) {
    return firstValueFrom(
      this.authClient.send({ cmd: 'get_customer' }, { id, organizationId: req.user.organizationId }),
    );
  }

  @Post()
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'Create a customer' })
  async create(@Body() dto: CustomerDto, @Request() req: any) {
    return firstValueFrom(
      this.authClient.send({ cmd: 'create_customer' }, { organizationId: req.user.organizationId, dto }),
    );
  }

  @Patch(':id')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'Update a customer' })
  async update(@Param('id') id: string, @Body() dto: CustomerDto, @Request() req: any) {
    return firstValueFrom(
      this.authClient.send({ cmd: 'update_customer' }, { id, organizationId: req.user.organizationId, dto }),
    );
  }

  @Delete(':id')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'Deactivate a customer (soft delete)' })
  async remove(@Param('id') id: string, @Request() req: any) {
    return firstValueFrom(
      this.authClient.send({ cmd: 'delete_customer' }, { id, organizationId: req.user.organizationId }),
    );
  }
}
