import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { SERVICE_NAMES, createClientOptions } from '@hbcfield/shared';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [
    BillingModule,
    // Outbound client so join-request submits can alert admins + managers.
    ClientsModule.registerAsync([createClientOptions(SERVICE_NAMES.NOTIFICATION)]),
  ],
  controllers: [OnboardingController],
  providers: [OnboardingService],
  exports: [OnboardingService],
})
export class OnboardingModule {}
