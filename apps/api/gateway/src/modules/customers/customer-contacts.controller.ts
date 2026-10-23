import { Controller, Get, Post, Body, Param, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CustomerCrmCalls, crmCaller } from './customer-crm-calls';
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
export class CustomerContactsController {
  constructor(private readonly crm: CustomerCrmCalls) {}

  @Get(':id/contacts')
  @ApiOperation({ summary: 'Who works at this company' })
  async listContacts(@Param('id') id: string, @Request() req: AuthedRequest) {
    return this.crm.auth(listCustomerContacts, {
      companyId: id,
      organizationId: callerOrgId(req.user),
      caller: crmCaller(req),
    });
  }

  @Get(':id/companies')
  @ApiOperation({ summary: 'Which companies this person is a contact at' })
  async listContactCompanies(@Param('id') id: string, @Request() req: AuthedRequest) {
    return this.crm.auth(listCustomerContactCompanies, {
      personId: id,
      organizationId: callerOrgId(req.user),
      caller: crmCaller(req),
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
    return this.crm.auth(addCustomerContact, {
      companyId: id,
      personId: body?.personId,
      person: body?.person,
      role: body?.role,
      isPrimary: body?.isPrimary,
      organizationId: callerOrgId(req.user),
      caller: crmCaller(req),
    });
  }

  @Post(':id/promote')
  @ApiOperation({ summary: 'Make a contact person a client in their own right' })
  async promoteContact(@Param('id') id: string, @Request() req: AuthedRequest) {
    return this.crm.auth(promoteCustomerContact, {
      personId: id,
      organizationId: callerOrgId(req.user),
      caller: crmCaller(req),
    });
  }
}
