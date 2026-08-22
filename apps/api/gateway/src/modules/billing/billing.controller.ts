import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Req,
  Inject,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { firstValueFrom } from 'rxjs';
import { Role, CurrentUser, CurrentUserData, ADD_ON_KEYS } from '@hbcfield/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators';
import { SetAddOnsDto } from './dto';

@ApiTags('billing')
@Controller('billing')
export class BillingController {
  constructor(
    @Inject('AUTH_SERVICE') private readonly authClient: ClientProxy,
    private readonly config: ConfigService,
  ) {}

  /** Web app base URL (server-controlled → no open-redirect from client input). */
  private webBase(): string {
    const origins = this.config.get<string>('CORS_ORIGINS', 'http://localhost:3000');
    return (origins.split(',')[0] || 'http://localhost:3000').trim().replace(/\/$/, '');
  }

  private unwrap(result: any) {
    if (result && result.success === false) {
      throw new HttpException({ message: result.message }, result.statusCode || HttpStatus.INTERNAL_SERVER_ERROR);
    }
    return result?.data ?? result;
  }

  @Get('subscription')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the org subscription/billing status' })
  async getSubscription(@CurrentUser() user: CurrentUserData) {
    return this.unwrap(
      await firstValueFrom(this.authClient.send({ cmd: 'billing_get_subscription' }, { organizationId: user.organizationId })),
    );
  }

  @Get('bill')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'The itemised bill: seats, every space, and org add-ons' })
  async getBill(@CurrentUser() user: CurrentUserData) {
    return this.unwrap(
      await firstValueFrom(this.authClient.send({ cmd: 'billing_get_bill' }, { organizationId: user.organizationId })),
    );
  }

  @Put('add-ons')
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Set which capabilities the organization has bought (ADMIN)' })
  async setAddOns(@CurrentUser() user: CurrentUserData, @Body() dto: SetAddOnsDto) {
    // organizationId comes from the TOKEN, never the body — an admin can only
    // ever change what their own organization has bought.
    return this.unwrap(
      await firstValueFrom(
        this.authClient.send({ cmd: 'billing_set_addons' }, { organizationId: user.organizationId, addOns: dto.addOns }),
      ),
    );
  }

  @Post('checkout')
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Start Stripe Checkout for what the org already has (ADMIN)' })
  async checkout(@CurrentUser() user: CurrentUserData) {
    const base = this.webBase();
    return this.unwrap(
      await firstValueFrom(
        this.authClient.send(
          { cmd: 'billing_create_checkout' },
          {
            organizationId: user.organizationId,
            successUrl: `${base}/settings/billing?checkout=success`,
            cancelUrl: `${base}/settings/billing?checkout=cancel`,
          },
        ),
      ),
    );
  }

  @Post('portal')
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Open the Stripe Customer Portal (ADMIN)' })
  async portal(@CurrentUser() user: CurrentUserData) {
    return this.unwrap(
      await firstValueFrom(
        this.authClient.send({ cmd: 'billing_create_portal' }, { organizationId: user.organizationId, returnUrl: `${this.webBase()}/settings/billing` }),
      ),
    );
  }

  @Post('cancel')
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cancel the subscription at period end (ADMIN)' })
  async cancel(@CurrentUser() user: CurrentUserData) {
    return this.unwrap(
      await firstValueFrom(this.authClient.send({ cmd: 'billing_cancel' }, { organizationId: user.organizationId })),
    );
  }

  /**
   * Stripe webhook — public (verified by HMAC signature, not by our JWT).
   * The raw request bytes are captured in main.ts (express.json verify) so the
   * signature check in auth-service is over the exact payload. Returns 200 fast.
   */
  @Public()
  @Post('webhooks/stripe')
  @Throttle({ default: { limit: 200, ttl: 60000 } })
  @ApiOperation({ summary: 'Stripe webhook receiver (public, signature-verified)' })
  async webhook(@Req() req: any) {
    const signature = (req.headers['stripe-signature'] as string) || '';
    const rawBody: string = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body ?? {});
    const result = await firstValueFrom(this.authClient.send({ cmd: 'billing_webhook' }, { rawBody, signature }));
    if (result && result.success === false) {
      throw new HttpException({ message: result.message }, result.statusCode || HttpStatus.BAD_REQUEST);
    }
    return { received: true };
  }

  /**
   * PLATFORM-OPERATOR endpoint — set an org's tier (mainly ENTERPRISE for custom
   * Stripe quotes). NOT a customer action: it's Public (no JWT) but gated by the
   * `x-platform-admin-key` secret so only the operator (you) can call it. Fails
   * closed if PLATFORM_ADMIN_KEY isn't configured.
   */
  /** Fail-closed platform-secret gate for operator endpoints. */
  private assertPlatformKey(req: any): void {
    const expected = this.config.get<string>('PLATFORM_ADMIN_KEY');
    const provided = (req.headers['x-platform-admin-key'] as string) || '';
    if (!expected || provided !== expected) {
      throw new HttpException({ message: 'Forbidden' }, HttpStatus.FORBIDDEN);
    }
  }

  @Public()
  @Get('admin/orgs')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Operator: list orgs + billing state (secret-gated)' })
  async adminListOrgs(@Req() req: any) {
    this.assertPlatformKey(req);
    return firstValueFrom(this.authClient.send({ cmd: 'billing_admin_list_orgs' }, {}));
  }

  /**
   * Operator grant. Replaces "set an org tier": a negotiated contract now grants
   * the capabilities it actually covers, which is both more honest than naming a
   * bundle and the only thing the gate understands.
   *
   * Omitting `addOns` grants EVERYTHING — the common operator case is an
   * enterprise contract, and that is what setting the enterprise tier used to
   * mean. Sending `[]` removes them all, deliberately distinguishable from
   * omitting the field.
   */
  @Public()
  @Post('admin/org-add-ons')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Operator: grant an org its capabilities (secret-gated, not a customer route)' })
  async adminSetOrgAddOns(
    @Body() dto: { organizationId?: string; addOns?: string[] },
    @Req() req: any,
  ) {
    this.assertPlatformKey(req);
    if (!dto?.organizationId) {
      throw new HttpException({ message: 'organizationId is required' }, HttpStatus.BAD_REQUEST);
    }
    const addOns = Array.isArray(dto.addOns) ? dto.addOns : ADD_ON_KEYS;
    const result = await firstValueFrom(
      this.authClient.send({ cmd: 'billing_admin_set_addons' }, { organizationId: dto.organizationId, addOns }),
    );
    if (result && result.success === false) {
      throw new HttpException({ message: result.message }, result.statusCode || HttpStatus.BAD_REQUEST);
    }
    return result;
  }
}
