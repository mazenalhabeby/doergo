import { Module } from '@nestjs/common';
import { GeoController } from './geo.controller';

/** Server-side geocoding proxy to the self-hosted Photon index. */
@Module({
  controllers: [GeoController],
})
export class GeoModule {}
