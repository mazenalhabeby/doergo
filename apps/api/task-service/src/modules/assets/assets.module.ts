import { Module } from '@nestjs/common';
import { AssetsService } from './assets.service';
import { AssetsController } from './assets.controller';
import { AssetsProcessor } from './assets.processor';

@Module({
  controllers: [AssetsController],
  providers: [AssetsService, AssetsProcessor],
  exports: [AssetsService],
})
export class AssetsModule {}
