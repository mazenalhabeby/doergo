import { Controller, Get, Post, Body, Param, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CustomersControllerBase } from './customers-controller.base';
import {
  listCustomerContacts,
  listCustomerContactCompanies,
  addCustomerContact,
  promoteCustomerContact,
} from '@hbcfield/shared/microservices';

import type { AuthedRequest } from '../../common/request.types';
import { callerOrgId } from '../../common/caller-org';
import { AddCustomerContactDto } from './dto/customer-bodies.dto';
/**
 * /customers/:id — contact people: who works at a company, which companies a
 * person contacts, attaching one, making one a client.
 */
@ApiTags('customers')
@ApiBearerAuth()
@Controller('customers')
export class CustomerContactsController extends CustomersControllerBase {
  @Get(':id/contacts')
  @ApiOperation({ summary: 'Who works at this company' })
  async listContacts(@Param('id') id: string, @Request() req: AuthedRequest) {
    return this.auth(listCustomerContacts, {
      companyId: id,
      organizationId: callerOrgId(req.user),
      caller: this.caller(req),
    });
  }

  @Get(':id/companies')
  @ApiOperation({ summary: 'Which companies this person is a contact at' })
  async listContactCompanies(@Param('id') id: string, @Request() req: AuthedRequest) {
    return this.auth(listCustomerContactCompanies, {
      personId: id,
      organizationId: callerOrgId(req.user),
      caller: this.caller(req),
    });
  }

  @Post(':id/contacts')
  @ApiOperation({ summary: 'Attach a person to this company — an existing one, or a new one' })
  async addContact(
    @Param('id') id: string,
    @Body()
    body: AddCustomerContactDto,
    @Request() req: AuthedRequest,
  ) {
    return this.auth(addCustomerContact, {
      companyId: id,
      personId: body?.personId,
      person: body?.person,
      role: body?.role,
      isPrimary: body?.isPrimary,
      organizationId: callerOrgId(req.user),
      caller: this.caller(req),
    });
  }

  @Post(':id/promote')
  @ApiOperation({ summary: 'Make a contact person a client in their own right' })
  async promoteContact(@Param('id') id: string, @Request() req: AuthedRequest) {
    return this.auth(promoteCustomerContact, {
      personId: id,
      organizationId: callerOrgId(req.user),
      caller: this.caller(req),
    });
  }
}
