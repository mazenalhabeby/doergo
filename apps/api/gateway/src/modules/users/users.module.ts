import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { TasksModule } from '../tasks/tasks.module';

@Module({
  imports: [TasksModule],
  controllers: [UsersController],
})
export class UsersModule {}
