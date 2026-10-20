import { Module } from '@nestjs/common';
import { PeopleController } from './people.controller';
import { SpacesModule } from '../spaces/spaces.module';
import { ChatModule } from '../chat/chat.module';

@Module({
  imports: [SpacesModule, ChatModule],
  controllers: [PeopleController],
})
export class PeopleModule {}
