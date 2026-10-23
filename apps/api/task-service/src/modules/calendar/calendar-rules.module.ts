import { Module } from '@nestjs/common';
import { PrismaModule } from '@hbcfield/shared';
import { CalendarRulesService } from './calendar-rules.service';
import { PlaceRulesService } from './place-rules.service';

/**
 * The calendar's day rules on their own — imported by the leave/cover code (technicians) and by the
 * calendar itself, so neither has to import the other.
 */
@Module({
  imports: [PrismaModule],
  providers: [PlaceRulesService, CalendarRulesService],
  exports: [CalendarRulesService],
})
export class CalendarRulesModule {}
