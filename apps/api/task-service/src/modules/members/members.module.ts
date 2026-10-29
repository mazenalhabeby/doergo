import { Module } from '@nestjs/common';
import { TasksModule } from '../tasks/tasks.module';
import { AssetsModule } from '../assets/assets.module';
import { ClockOutModule } from '../attendance/clock-out/clock-out.module';
import { MembersController } from './members.controller';
import { MemberOffboardService } from './member-offboard.service';

@Module({
  imports: [TasksModule, AssetsModule, ClockOutModule],
  controllers: [MembersController],
  providers: [MemberOffboardService],
})
export class MembersModule {}
