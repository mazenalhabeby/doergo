import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

// PrismaModule is @Global, so SearchService can inject PrismaService directly.
@Module({
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
