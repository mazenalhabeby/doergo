import { Module } from '@nestjs/common';
import { TasksModule } from '../tasks/tasks.module';
import { AssetsModule } from '../assets/assets.module';
import { MembersController } from './members.controller';
import { MemberOffboardService } from './member-offboard.service';

@Module({
  imports: [TasksModule, AssetsModule],
  controllers: [MembersController],
  providers: [MemberOffboardService],
})
export class MembersModule {}
