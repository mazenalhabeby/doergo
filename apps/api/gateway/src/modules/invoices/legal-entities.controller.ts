import { ServiceCalls } from '../../common/microservices/service-calls';
import { Controller, Get, Post, Patch, Body, Param, Query, HttpStatus, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import {
  Role,
  CurrentUser,
  CurrentUserData,
  isAdmin,
  accessAllowsAnywhere,
  type AccessPermissionKey,
  assertServiceOk,
} from '@hbcfield/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { DenyExternal } from '../../common/decorators';
import type { SessionUser } from '../../common/request.types';

/** Who needs the NAMES of the companies: whoever invoices, or chooses who invoices a workspace or a client. */
const READ_KEYS: AccessPermissionKey[] = [
  'canManageInvoices',
  'canManageWorkspaces',
  'crmEditInfo',
  'crmManageClients',
];

/**
 * Held by this caller: the user's own flag OR the resolved access (org-wide or in any workspace) —
 * the same two sources PermissionsGuard reads. Reading only `access` refused a manager whose
 * invoicing comes through the bridged flag, while the invoice routes let them in.
 */
const holds = (user: CurrentUserData, key: AccessPermissionKey) =>
  (user as unknown as Record<string, unknown>)[key] === true || accessAllowsAnywhere(user.access as never, key);

/**
 * COMPANIES — the legal entities whose name goes on an invoice (docs/plans/companies-legal-entities.md).
 *
 * ⚠️ Writes are ADMIN-only: this is the company's legal and BANK identity — an edit here changes
 * where clients send money. ⚠️ Bank accounts leave only for `canManageInvoices` (or an admin); a
 * workspace manager picking "invoices issued by" needs the names, not the IBANs. ⚠️ External
 * members are refused outright. The organization always comes from the token.
 */
@ApiTags('companies')
@Controller('legal-entities')
@ApiBearerAuth()
@DenyExternal()
export class LegalEntitiesController {
  constructor(private readonly services: ServiceCalls) {}

  private async call(cmd: string, payload: Record<string, unknown>) {
    const result = await this.services.auth.askCmd(cmd, payload);
    assertServiceOk(result, HttpStatus.BAD_REQUEST);
    return result;
  }

  @Get()
  @ApiOperation({ summary: "The organization's companies (bank accounts only for invoicing)" })
  async list(@Query('includeInactive') includeInactive: string | undefined, @CurrentUser() user: SessionUser) {
    const admin = isAdmin(user);
    if (!admin && !READ_KEYS.some((k) => holds(user, k))) {
      throw new ForbiddenException('You do not have permission to see the companies');
    }
    const withBank = admin || holds(user, 'canManageInvoices');
    return this.call('legal_entity_list', {
      organizationId: user.organizationId,
      withBank,
      includeInactive: admin && includeInactive === 'true',
    });
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Add a company' })
  create(@Body() body: Record<string, unknown>, @CurrentUser() user: SessionUser) {
    return this.call('legal_entity_create', { organizationId: user.organizationId, input: body ?? {} });
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: "Edit a company's details or bank accounts" })
  update(@Param('id') id: string, @Body() body: Record<string, unknown>, @CurrentUser() user: SessionUser) {
    return this.call('legal_entity_update', { organizationId: user.organizationId, id, input: body ?? {} });
  }

  @Post(':id/main')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Make this the main company' })
  setMain(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.call('legal_entity_set_main', { organizationId: user.organizationId, id });
  }

  @Post(':id/deactivate')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Switch a company off (issued invoices keep it)' })
  deactivate(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.call('legal_entity_set_active', { organizationId: user.organizationId, id, active: false });
  }

  @Post(':id/reactivate')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Switch a company back on' })
  reactivate(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.call('legal_entity_set_active', { organizationId: user.organizationId, id, active: true });
  }
}
