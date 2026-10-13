import { Global, Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { SERVICE_NAMES, createClientOptions } from '@hbcfield/shared';
import { ApprovalRulesService } from './approval-rules.service';

/** One gate for every approve path that office rules apply to (overtime, requests, expenses). */
@Global()
@Module({
  imports: [ClientsModule.registerAsync([createClientOptions(SERVICE_NAMES.NOTIFICATION)])],
  providers: [ApprovalRulesService],
  exports: [ApprovalRulesService],
})
export class ApprovalRulesModule {}
