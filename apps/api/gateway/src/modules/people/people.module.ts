import { Module } from '@nestjs/common';
import { PeopleController } from './people.controller';
import { LocationsModule } from '../locations/locations.module';
import { ChatModule } from '../chat/chat.module';

@Module({
  imports: [LocationsModule, ChatModule],
  controllers: [PeopleController],
})
export class PeopleModule {}
