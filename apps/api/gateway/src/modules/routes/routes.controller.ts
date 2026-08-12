import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
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
   */
  @Post('optimize')
  @ApiOperation({ summary: 'Optimize a multi-stop visit route' })
  optimize(@Body() dto: OptimizeRouteDto) {
    return this.routesService.optimize(dto);
  }
}
