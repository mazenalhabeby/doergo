import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';

// The microservice clients (AUTH_SERVICE, TASK) are provided globally by
// MicroservicesModule, so the controller only needs to be registered.
@Module({
  controllers: [SearchController],
})
export class SearchModule {}
