import {
  Controller,
  Get,
  Post,
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
import { Role, CurrentUser, CurrentUserData } from '@hbcfield/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators';
import { CheckoutDto, ChangePlanDto } from './dto';

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

  @Post('checkout')
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Start Stripe Checkout for a self-serve plan (ADMIN)' })
  async checkout(@CurrentUser() user: CurrentUserData, @Body() dto: CheckoutDto) {
    const base = this.webBase();
    return this.unwrap(
      await firstValueFrom(
        this.authClient.send(
          { cmd: 'billing_create_checkout' },
          {
            organizationId: user.organizationId,
            req: { tier: dto.tier, interval: dto.interval },
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

  @Post('change-plan')
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change the active plan/interval (ADMIN)' })
  async changePlan(@CurrentUser() user: CurrentUserData, @Body() dto: ChangePlanDto) {
    const base = this.webBase();
    return this.unwrap(
      await firstValueFrom(
        this.authClient.send(
          { cmd: 'billing_change_plan' },
          {
            organizationId: user.organizationId,
            req: { tier: dto.tier, interval: dto.interval },
            successUrl: `${base}/settings/billing`,
            cancelUrl: `${base}/settings/billing`,
          },
        ),
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
}
