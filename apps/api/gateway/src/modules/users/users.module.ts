import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UserDevicesController } from './user-devices.controller';
import { UserDirectoryController } from './user-directory.controller';
import { TasksModule } from '../tasks/tasks.module';

@Module({
  imports: [TasksModule],
  // UsersController first: its `me` routes before UserDirectoryController's `:id`.
  controllers: [UsersController, UserDevicesController, UserDirectoryController],
})
export class UsersModule {}
