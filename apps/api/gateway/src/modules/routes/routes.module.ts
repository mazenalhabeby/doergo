import { Module } from '@nestjs/common';
import { RoutesController } from './routes.controller';
import { RoutesService } from './routes.service';

// Stateless route-optimization proxy (OSRM /trip). No microservice / queue —
// pure compute + an outbound HTTP call, so it lives entirely in the gateway.
@Module({
  controllers: [RoutesController],
  providers: [RoutesService],
})
export class RoutesModule {}
