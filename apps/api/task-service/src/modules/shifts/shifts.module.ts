import { Module } from '@nestjs/common';
import { ShiftsController } from './shifts.controller';
import { ShiftsService } from './shifts.service';
import { AttendanceModule } from '../attendance/attendance.module';
import { ShiftAssignmentsService } from './shift-assignments.service';
import { RotaService } from './rota.service';

@Module({
  imports: [AttendanceModule],
  controllers: [ShiftsController],
  providers: [ShiftsService, ShiftAssignmentsService, RotaService],
  exports: [ShiftsService],
})
export class ShiftsModule {}
