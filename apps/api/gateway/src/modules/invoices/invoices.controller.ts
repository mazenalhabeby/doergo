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
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { firstValueFrom } from 'rxjs';
import { Role, CurrentUser, CurrentUserData } from '@hbcfield/shared';
import { RequirePermission } from '../../common/decorators';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePlan } from '../../common/decorators/require-plan.decorator';

@ApiTags('invoices')
@RequirePlan('invoicing') // Professional+ (write routes; reads pass through)
@Controller('invoices')
@ApiBearerAuth()
export class InvoicesController {
  constructor(
    @Inject('AUTH_SERVICE') private readonly authClient: ClientProxy,
  ) {}

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create invoice' })
  async create(
    @Body() body: any,
    @CurrentUser() user: CurrentUserData,
  ) {
    const result = await firstValueFrom(
      this.authClient.send({ cmd: 'invoice_create' }, {
        ...body,
        organizationId: user.organizationId,
        createdById: user.id,
      }),
    );

    if (result && result.success === false) {
      throw new HttpException(
        { message: result.message },
        result.statusCode || HttpStatus.BAD_REQUEST,
      );
    }

    return result;
  }

  @Get()
  @RequirePermission('canViewAllTasks')
  @ApiOperation({ summary: 'List invoices' })
  async findAll(
    @Query() query: { status?: string; spaceId?: string; page?: string; limit?: string },
    @CurrentUser() user: CurrentUserData,
  ) {
    return firstValueFrom(
      this.authClient.send({ cmd: 'invoice_list' }, {
        organizationId: user.organizationId,
        status: query.status,
        spaceId: query.spaceId,
        page: query.page ? Number(query.page) : undefined,
        limit: query.limit ? Number(query.limit) : undefined,
      }),
    );
  }

  // NOTE: must be declared BEFORE the ':id' route so "gather" isn't captured as an id.
  @Get('gather')
  @RequirePermission('canViewAllTasks')
  @ApiOperation({ summary: "Build draft invoice lines from a customer space's completed work" })
  async gather(
    @Query('spaceId') spaceId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    if (!spaceId) {
      throw new HttpException({ message: 'spaceId is required' }, HttpStatus.BAD_REQUEST);
    }
    const result = await firstValueFrom(
      this.authClient.send({ cmd: 'invoice_gather' }, {
        organizationId: user.organizationId,
        spaceId,
      }),
    );
    if (result && result.success === false) {
      throw new HttpException(
        { message: result.message },
        result.statusCode || HttpStatus.BAD_REQUEST,
      );
    }
    return result;
  }

  @Get(':id')
  @RequirePermission('canViewAllTasks')
  @ApiOperation({ summary: 'Get invoice detail' })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    const result = await firstValueFrom(
      this.authClient.send({ cmd: 'invoice_get' }, {
        id,
        organizationId: user.organizationId,
      }),
    );

    if (result && result.success === false) {
      throw new HttpException(
        { message: result.message },
        result.statusCode || HttpStatus.NOT_FOUND,
      );
    }

    return result;
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update draft invoice' })
  async update(
    @Param('id') id: string,
    @Body() body: any,
    @CurrentUser() user: CurrentUserData,
  ) {
    const result = await firstValueFrom(
      this.authClient.send({ cmd: 'invoice_update' }, {
        ...body,
        // id + org LAST so a malicious body cannot override the tenant scope
        // (body is untyped, so ValidationPipe's whitelist doesn't strip them).
        id,
        organizationId: user.organizationId,
      }),
    );

    if (result && result.success === false) {
      throw new HttpException(
        { message: result.message },
        result.statusCode || HttpStatus.BAD_REQUEST,
      );
    }

    return result;
  }

  @Patch(':id/status')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Change invoice status' })
  async updateStatus(
    @Param('id') id: string,
    @Body() body: { status: string },
    @CurrentUser() user: CurrentUserData,
  ) {
    const result = await firstValueFrom(
      this.authClient.send({ cmd: 'invoice_update_status' }, {
        id,
        organizationId: user.organizationId,
        status: body.status,
      }),
    );

    if (result && result.success === false) {
      throw new HttpException(
        { message: result.message },
        result.statusCode || HttpStatus.BAD_REQUEST,
      );
    }

    return result;
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete draft invoice' })
  async delete(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    const result = await firstValueFrom(
      this.authClient.send({ cmd: 'invoice_delete' }, {
        id,
        organizationId: user.organizationId,
      }),
    );

    if (result && result.success === false) {
      throw new HttpException(
        { message: result.message },
        result.statusCode || HttpStatus.BAD_REQUEST,
      );
    }

    return result;
  }

  @Post(':id/items')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Add line item to invoice' })
  async addItem(
    @Param('id') invoiceId: string,
    @Body() body: any,
    @CurrentUser() user: CurrentUserData,
  ) {
    const result = await firstValueFrom(
      this.authClient.send({ cmd: 'invoice_add_item' }, {
        invoiceId,
        organizationId: user.organizationId,
        item: body,
      }),
    );

    if (result && result.success === false) {
      throw new HttpException(
        { message: result.message },
        result.statusCode || HttpStatus.BAD_REQUEST,
      );
    }

    return result;
  }

  @Delete(':id/items/:itemId')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Remove line item from invoice' })
  async removeItem(
    @Param('id') invoiceId: string,
    @Param('itemId') itemId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    const result = await firstValueFrom(
      this.authClient.send({ cmd: 'invoice_remove_item' }, {
        invoiceId,
        itemId,
        organizationId: user.organizationId,
      }),
    );

    if (result && result.success === false) {
      throw new HttpException(
        { message: result.message },
        result.statusCode || HttpStatus.BAD_REQUEST,
      );
    }

    return result;
  }
}
