import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { SERVICE_NAMES, createClientOptions } from '@hbcfield/shared';
import { MemberOffboarding } from './member-offboarding.service';

@Module({
  imports: [ClientsModule.registerAsync([createClientOptions(SERVICE_NAMES.TASK)])],
  providers: [MemberOffboarding],
  exports: [MemberOffboarding],
})
export class MemberOffboardingModule {}
