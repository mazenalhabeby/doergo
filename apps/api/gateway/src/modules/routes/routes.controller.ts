import { Body, Controller, HttpException, HttpStatus, Post, Request } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { moduleAnywhere } from '@hbcfield/shared';
import { DenyExternal } from '../../common/decorators/deny-external.decorator';
import { RoutesService } from './routes.service';
import { OptimizeRouteDto } from './dto/optimize-route.dto';

@ApiTags('routes')
@Controller('routes')
export class RoutesController {
  constructor(private readonly routesService: RoutesService) {}

  /**
   * Optimize a multi-stop visit route (Traveling-Salesman). Stateless: the caller
   * passes a start, the stops (already geocoded), and an optional end; we return
   * the best visit order + per-leg ETAs + geometry. The client then hands the
   * ordered stops to Google Maps / Waze / Apple Maps for turn-by-turn nav.
   *
   * ⚠️ BILLED PER REQUEST (Google Routes), so it is gated three ways — it used
   * to ask nothing but a sign-in, and any account could spend the budget:
   *   • external members never drive for the organization (`@DenyExternal`);
   *   • `tracking` must run in a workspace the caller is assigned to — the same
   *     `moduleAnywhere` question the phone asks before offering the planner,
   *     read off the session, so it costs no lookup;
   *   • a rate limit well above a real day (a replan is one call) and well
   *     below a script.
   */
  @Post('optimize')
  @DenyExternal()
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'Optimize a multi-stop visit route' })
  optimize(@Body() dto: OptimizeRouteDto, @Request() req: any) {
    if (!moduleAnywhere(req.user, 'tracking')) {
      throw new HttpException(
        { statusCode: HttpStatus.PAYMENT_REQUIRED, message: 'The "tracking" module is not switched on in any of your workspaces.', error: 'ModuleDisabled', feature: 'tracking' },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
    return this.routesService.optimize(dto);
  }
}
