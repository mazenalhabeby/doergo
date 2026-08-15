import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { SERVICE_NAMES, createClientOptions } from '@hbcfield/shared';
import { ShiftIssuesService } from './shift-issues.service';
import { ShiftIssuesController } from './shift-issues.controller';
import { NotificationRoutingService } from '../../common/notification-routing.service';

@Module({
  imports: [ClientsModule.registerAsync([createClientOptions(SERVICE_NAMES.NOTIFICATION)])],
  controllers: [ShiftIssuesController],
  providers: [ShiftIssuesService, NotificationRoutingService],
  exports: [ShiftIssuesService],
})
export class ShiftIssuesModule {}
