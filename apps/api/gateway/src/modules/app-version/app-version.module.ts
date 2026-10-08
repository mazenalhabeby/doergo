import { Module } from '@nestjs/common';
import { AppUpdateNoticeController, AppVersionController } from './app-version.controller';

@Module({ controllers: [AppVersionController, AppUpdateNoticeController] })
export class AppVersionModule {}
