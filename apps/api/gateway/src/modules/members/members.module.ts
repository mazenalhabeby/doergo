import { Module } from '@nestjs/common';
import { MembersController } from './members.controller';
import { MemberCoverController } from './member-cover.controller';
import { TimeOffAdminController } from './time-off-admin.controller';
import { LeaveLedgerController } from './leave-ledger.controller';
import { MemberRecordsController } from './member-records.controller';
import { MemberTimeOffController } from './member-time-off.controller';

@Module({
  // ⚠️ ORDER MATTERS: one-segment paths (availability, floor-now, cover-range,
  // time-off, leave-opening) must be registered before MembersController's
  // `GET :id`, or Express hands them to it as an id.
  controllers: [
    MemberCoverController,
    TimeOffAdminController,
    LeaveLedgerController,
    MembersController,
    MemberRecordsController,
    MemberTimeOffController,
  ],
})
export class MembersModule {}
