import { Module } from '@nestjs/common';
import { ShiftResolverService } from './shift-resolver.service';
import { CountedTimeService } from './counted-time.service';
import { BreakRulesService } from './break-rules.service';
import { AttendanceRoutingService } from './attendance-routing.service';
import { AttendanceGeocoderService } from './attendance-geocoder.service';

/**
 * The rules every part of attendance asks: which shift a moment belongs to, what hours count, the
 * rest rules, who is told, where a clock step happened.
 */
@Module({
  providers: [
    ShiftResolverService,
    CountedTimeService,
    BreakRulesService,
    AttendanceRoutingService,
    AttendanceGeocoderService,
  ],
  exports: [
    ShiftResolverService,
    CountedTimeService,
    BreakRulesService,
    AttendanceRoutingService,
    AttendanceGeocoderService,
  ],
})
export class AttendanceCoreModule {}
