import { Module } from '@nestjs/common';
import { EmployeesController } from './technicians.controller';
import { EmployeeCoverController } from './employee-cover.controller';
import { TimeOffAdminController } from './time-off-admin.controller';
import { LeaveLedgerController } from './leave-ledger.controller';
import { EmployeeRecordsController } from './employee-records.controller';
import { EmployeeTimeOffController } from './employee-time-off.controller';

@Module({
  // ⚠️ ORDER MATTERS: one-segment paths (availability, floor-now, cover-range,
  // time-off, leave-opening) must be registered before EmployeesController's
  // `GET :id`, or Express hands them to it as an id.
  controllers: [
    EmployeeCoverController,
    TimeOffAdminController,
    LeaveLedgerController,
    EmployeesController,
    EmployeeRecordsController,
    EmployeeTimeOffController,
  ],
})
export class EmployeesModule {}
