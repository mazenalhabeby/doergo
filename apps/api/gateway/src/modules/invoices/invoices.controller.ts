import { ServiceCalls } from '../../common/microservices/service-calls';
import { Controller, Get, Post, Patch, Delete, Body, Param, Query, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Role, CurrentUser, stripLabourCost, assertServiceOk } from '@hbcfield/shared';
import { RequirePermission } from '../../common/decorators';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePlan } from '../../common/decorators/require-plan.decorator';
import {
  invoiceCreate,
  invoiceList,
  invoiceExchangeRate,
  invoiceGather,
  invoiceGet,
  invoiceUpdate,
  invoiceUpdateStatus,
  invoiceDelete,
  invoiceAddItem,
  invoiceRemoveItem,
} from '@hbcfield/shared/microservices';
import { callerOrgId } from '../../common/caller-org';
import type { SessionUser } from '../../common/request.types';
import { CreateInvoiceDto, UpdateInvoiceDto, InvoiceStatusDto, InvoiceItemDto } from './dto/invoice-bodies.dto';

@ApiTags('invoices')
@RequirePlan('invoicing') // Professional+ (write routes; reads pass through)
/*
  Reads are gated on `canManageInvoices`, its own capability rather than a share of
  canViewAllTasks. Bridged in auth-service so today's set is unchanged (see
  orgPermissionFields) — the point is that an organization can now hand customer
  invoicing to a bookkeeper without also handing them every space, asset and report.

  Writes stay ADMIN-only, deliberately: widening them here would have gone from
  "admins only" to "every manager" the moment the bridge was added.
*/
@Controller('invoices')
@ApiBearerAuth()
export class InvoicesController {
  constructor(private readonly services: ServiceCalls) {}

  /**
   * Everything leaving this controller passes through here.
   *
   * ⚠️ COST IS STRIPPED AT THE BOUNDARY, not hidden by the screen. A field that
   * reaches the browser has been disclosed whatever the UI chooses to draw, and
   * this one is the number a client must never see beside their own.
   *
   * ⚠️ And `canManageInvoices` does NOT imply it. Raising an invoice is an
   * office job; what the labour cost the company is a different question asked
   * by a different person. Bundling them lets the first clerk hired read the
   * margin on every job — the sort of thing nobody notices until it matters.
   *
   * One funnel rather than a check per route: eight routes return invoices, and
   * the ninth somebody adds is the one that forgets.
   */
  private forCaller(result: unknown, user: SessionUser) {
    const may = user.canViewLabourCost === true;
    if (!result || typeof result !== 'object') return result;
    /*
      Three shapes leave here: a list of invoices, one invoice, and the gather
      result — whose `workEntries` carry the same rates under a different name.
      All three go through the same strip, which is why it knows both names.
    */
    const reply = result as { data?: unknown };
    if (Array.isArray(reply.data)) {
      return { ...reply, data: reply.data.map((inv: unknown) => stripLabourCost(inv, may)) };
    }
    if (reply.data) return { ...reply, data: stripLabourCost(reply.data, may) };
    return stripLabourCost(result, may);
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create invoice' })
  async create(@Body() body: CreateInvoiceDto, @CurrentUser() user: SessionUser) {
    const result = await this.services.auth.ask(invoiceCreate, {
      ...body,
      organizationId: user.organizationId,
      createdById: user.id,
    });

    assertServiceOk(result, HttpStatus.BAD_REQUEST);

    return this.forCaller(result, user);
  }

  @Get()
  @RequirePermission('canManageInvoices')
  @ApiOperation({ summary: 'List invoices' })
  async findAll(
    @Query() query: { status?: string; spaceId?: string; legalEntityId?: string; page?: string; limit?: string },
    @CurrentUser() user: SessionUser,
  ) {
    /*
      ⚠️ Through the funnel like every other route. This returned the raw list,
      whose items carry each line's `costRateCents` — so the one route a
      bookkeeper opens first disclosed the margin the other eight hid.
    */
    const result = await this.services.auth.ask(invoiceList, {
      organizationId: callerOrgId(user),
      status: query.status,
      spaceId: query.spaceId,
      legalEntityId: query.legalEntityId || undefined,
      page: query.page ? Number(query.page) : undefined,
      limit: query.limit ? Number(query.limit) : undefined,
    });
    return this.forCaller(result, user);
  }

  /**
   * `1 {currency} = rate {the organization's currency}` on a day — the ECB's
   * reference rate, for a cross-currency invoice's margin. Null when none is
   * known. Declared before ':id' for the same reason as gather.
   */
  @Get('exchange-rate')
  @RequirePermission('canManageInvoices')
  @ApiOperation({ summary: "ECB exchange rate from a currency to the organization's, on a day" })
  async exchangeRate(
    @Query('currency') currency: string | undefined,
    @Query('date') date: string | undefined,
    @CurrentUser() user: SessionUser,
  ) {
    const result = await this.services.auth.ask(invoiceExchangeRate, {
      organizationId: callerOrgId(user),
      currency: String(currency ?? ''),
      date: typeof date === 'string' ? date : undefined,
    });
    assertServiceOk(result, HttpStatus.BAD_REQUEST);
    // Carries no cost — through the funnel anyway, so "every route" stays true.
    return this.forCaller(result, user);
  }

  // NOTE: must be declared BEFORE the ':id' route so "gather" isn't captured as an id.
  @Get('gather')
  @RequirePermission('canManageInvoices')
  @ApiOperation({ summary: "Build draft invoice lines from a customer space's completed work" })
  async gather(
    @Query('spaceId') spaceId: string | undefined,
    @Query('customerId') customerId: string | undefined,
    /** Service period, inclusive, `YYYY-MM-DD`. Either end may be omitted. */
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @CurrentUser() user: SessionUser,
  ) {
    /*
      ⚠️ Exactly one source, and the service says so rather than this route.
      A workspace and a client would silently INTERSECT, and an empty result
      then reads as "nothing to bill" when it means "these two do not overlap".

      The organization comes from the token, never the query — so a client id
      from another tenant fails to resolve and 404s, and never reaches a query
      that could return that tenant's work.
    */
    const result = await this.services.auth.ask(invoiceGather, {
      organizationId: callerOrgId(user),
      spaceId: spaceId || undefined,
      customerId: customerId || undefined,
      from: from || undefined,
      to: to || undefined,
    });
    assertServiceOk(result, HttpStatus.BAD_REQUEST);
    return this.forCaller(result, user);
  }

  @Get(':id')
  @RequirePermission('canManageInvoices')
  @ApiOperation({ summary: 'Get invoice detail' })
  async findOne(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    const result = await this.services.auth.ask(invoiceGet, {
      id,
      organizationId: user.organizationId,
    });

    assertServiceOk(result, HttpStatus.NOT_FOUND);

    return this.forCaller(result, user);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update draft invoice' })
  async update(@Param('id') id: string, @Body() body: UpdateInvoiceDto, @CurrentUser() user: SessionUser) {
    const result = await this.services.auth.ask(invoiceUpdate, {
      ...body,
      // id + org LAST so a body can never override the tenant scope (the DTO refuses
      // keys it does not declare, but the order is the rule that does not depend on it).
      id,
      organizationId: callerOrgId(user),
    });

    assertServiceOk(result, HttpStatus.BAD_REQUEST);

    return this.forCaller(result, user);
  }

  @Patch(':id/status')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Change invoice status' })
  async updateStatus(@Param('id') id: string, @Body() body: InvoiceStatusDto, @CurrentUser() user: SessionUser) {
    const result = await this.services.auth.ask(invoiceUpdateStatus, {
      id,
      organizationId: user.organizationId,
      status: body.status,
    });

    assertServiceOk(result, HttpStatus.BAD_REQUEST);

    return this.forCaller(result, user);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete draft invoice' })
  async delete(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    const result = await this.services.auth.ask(invoiceDelete, {
      id,
      organizationId: user.organizationId,
    });

    assertServiceOk(result, HttpStatus.BAD_REQUEST);

    return this.forCaller(result, user);
  }

  @Post(':id/items')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Add line item to invoice' })
  async addItem(@Param('id') invoiceId: string, @Body() body: InvoiceItemDto, @CurrentUser() user: SessionUser) {
    const result = await this.services.auth.ask(invoiceAddItem, {
      invoiceId,
      organizationId: callerOrgId(user),
      item: body,
    });

    assertServiceOk(result, HttpStatus.BAD_REQUEST);

    return this.forCaller(result, user);
  }

  @Delete(':id/items/:itemId')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Remove line item from invoice' })
  async removeItem(@Param('id') invoiceId: string, @Param('itemId') itemId: string, @CurrentUser() user: SessionUser) {
    const result = await this.services.auth.ask(invoiceRemoveItem, {
      invoiceId,
      itemId,
      organizationId: user.organizationId,
    });

    assertServiceOk(result, HttpStatus.BAD_REQUEST);

    return this.forCaller(result, user);
  }
}
